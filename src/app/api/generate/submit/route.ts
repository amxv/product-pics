import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db, batchTable, uploadedImageTable, generatedImageTable, runpodJobTable } from '../../../../../db';
import { eq } from 'drizzle-orm';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2Client, R2_BUCKET_NAME } from '@/lib/r2';
import { convertToPNG } from '@/lib/image';
import { assignBackgrounds } from '@/lib/backgrounds';
import { generatePrompt } from '@/lib/prompt';
import { submitJob } from '@/lib/runpod';
import { logError, logInfo } from '@/lib/logger';
import { nanoid } from 'nanoid';
import pLimit from 'p-limit';
import type { Demographic } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    // 1. Validate session
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Parse request body
    const body = await request.json();
    const { batchId } = body;

    if (!batchId) {
      return NextResponse.json(
        { error: 'Batch ID is required' },
        { status: 400 }
      );
    }

    // 3. Fetch batch from database
    const [batch] = await db
      .select()
      .from(batchTable)
      .where(eq(batchTable.id, batchId))
      .limit(1);

    if (!batch) {
      return NextResponse.json(
        { error: 'Batch not found' },
        { status: 404 }
      );
    }

    // 4. Verify user owns batch
    if (batch.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Forbidden: You do not own this batch' },
        { status: 403 }
      );
    }

    // 5. Verify batch status is "uploaded"
    if (batch.status !== 'uploaded') {
      return NextResponse.json(
        { error: `Batch status must be "uploaded", current status: ${batch.status}` },
        { status: 400 }
      );
    }

    // 6. Fetch all uploaded images for batch
    const uploadedImages = await db
      .select()
      .from(uploadedImageTable)
      .where(eq(uploadedImageTable.batchId, batchId));

    if (uploadedImages.length === 0) {
      return NextResponse.json(
        { error: 'No uploaded images found for this batch' },
        { status: 400 }
      );
    }

    logInfo('Generation submit', `Starting generation for batch ${batchId}`, {
      batchId,
      imageCount: uploadedImages.length,
      demographic: batch.demographic,
      ageRange: batch.ageRange,
    });

    // 7. Assign backgrounds
    const backgrounds = assignBackgrounds(uploadedImages.length);

    // 8. Process each image and submit to RunPod
    // Use p-limit to avoid overwhelming RunPod API
    const limit = pLimit(10); // Max 10 concurrent operations
    const jobPromises = uploadedImages.map((uploadedImage, index) =>
      limit(async () => {
        try {
          // 8a. Fetch image from R2
          const getCommand = new GetObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: uploadedImage.r2Key,
          });
          const s3Response = await r2Client.send(getCommand);
          const imageBuffer = Buffer.from(await s3Response.Body!.transformToByteArray());

          // 8b. Convert to PNG
          const pngBuffer = await convertToPNG(imageBuffer);

          // 8c. Upload PNG to temp location
          const tempKey = `temp/${nanoid()}.png`;
          const putCommand = new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: tempKey,
            Body: pngBuffer,
            ContentType: 'image/png',
          });
          await r2Client.send(putCommand);

          // 8d. Generate presigned GET URL for temp PNG (valid 24 hours)
          const tempGetCommand = new GetObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: tempKey,
          });
          const tempImageUrl = await getSignedUrl(r2Client, tempGetCommand, {
            expiresIn: 86400, // 24 hours
          });

          // 8e. Get kid model image URL
          // For MVP, use placeholder - would select based on demographic
          const kidModelNumber = (index % 3) + 1;
          const kidModelPath = `/models/${batch.demographic}-${kidModelNumber}.jpg`;
          const kidModelUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}${kidModelPath}`;

          // 8f. Generate prompt
          const background = backgrounds[index];
          const prompt = generatePrompt(batch.demographic as Demographic, batch.ageRange, background);

          // 8g. Submit job to RunPod
          const runpodJobId = await submitJob({
            prompt,
            images: [kidModelUrl, tempImageUrl], // Kid model first, product second
            size: '1024*1024',
            enable_safety_checker: true,
          });

          // 8h. Create generated_image record
          const generatedImageId = nanoid();
          await db.insert(generatedImageTable).values({
            id: generatedImageId,
            batchId: batch.id,
            uploadedImageId: uploadedImage.id,
            status: 'processing',
            background,
            runpodJobId: null, // Will be updated with runpod_job record
            retryCount: 0,
          });

          // 8i. Create runpod_job record
          const runpodJobRecordId = nanoid();
          await db.insert(runpodJobTable).values({
            id: runpodJobRecordId,
            generatedImageId,
            jobId: runpodJobId,
            status: 'in_queue',
            prompt,
            background,
          });

          // Update generated_image with runpodJobId reference
          await db
            .update(generatedImageTable)
            .set({ runpodJobId: runpodJobRecordId })
            .where(eq(generatedImageTable.id, generatedImageId));

          logInfo('Job submitted', `RunPod job ${runpodJobId} submitted`, {
            batchId,
            uploadedImageId: uploadedImage.id,
            generatedImageId,
            background,
          });

          return { success: true, jobId: runpodJobId };
        } catch (error) {
          logError('Job submission failed', error, {
            batchId,
            uploadedImageId: uploadedImage.id,
          });
          throw error;
        }
      })
    );

    // Wait for all jobs to be submitted
    const results = await Promise.allSettled(jobPromises);
    const successfulJobs = results.filter(r => r.status === 'fulfilled').length;
    const failedJobs = results.filter(r => r.status === 'rejected').length;

    if (successfulJobs === 0) {
      logError('All jobs failed to submit', new Error('All RunPod job submissions failed'), {
        batchId,
        failedCount: failedJobs,
      });
      return NextResponse.json(
        { error: 'Failed to submit any jobs to RunPod' },
        { status: 500 }
      );
    }

    // 9. Update batch status to "processing"
    await db
      .update(batchTable)
      .set({
        status: 'processing',
        updatedAt: new Date(),
      })
      .where(eq(batchTable.id, batchId));

    logInfo('Batch processing started', `Batch ${batchId} status updated to processing`, {
      batchId,
      totalJobs: successfulJobs,
      failedJobs,
    });

    // 10. Return success
    return NextResponse.json({
      success: true,
      totalJobs: successfulJobs,
      failedJobs,
    });
  } catch (error) {
    logError('Generation submit route error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
