import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db, batchTable, uploadedImageTable, generatedImageTable, runpodJobTable } from '../../../../../db';
import { eq, and } from 'drizzle-orm';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2Client, R2_BUCKET_NAME } from '@/lib/r2';
import { convertToPNG } from '@/lib/image';
import { generatePrompt } from '@/lib/prompt';
import { submitJob } from '@/lib/runpod';
import { logError, logInfo } from '@/lib/logger';
import { nanoid } from 'nanoid';
import pLimit from 'p-limit';
import type { Demographic, Background } from '@/lib/types';

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

    // 5. Fetch all failed images
    const failedImages = await db
      .select()
      .from(generatedImageTable)
      .where(
        and(
          eq(generatedImageTable.batchId, batchId),
          eq(generatedImageTable.status, 'failed')
        )
      );

    if (failedImages.length === 0) {
      return NextResponse.json({
        success: true,
        retriedCount: 0,
        message: 'No failed images to retry',
      });
    }

    logInfo('Retrying failed images', `Retrying ${failedImages.length} failed images`, {
      batchId,
      failedCount: failedImages.length,
    });

    // 6. Process each failed image and resubmit
    const limit = pLimit(10); // Max 10 concurrent operations
    const retryPromises = failedImages.map((generatedImage) =>
      limit(async () => {
        try {
          // Reset status and retry count
          await db
            .update(generatedImageTable)
            .set({
              status: 'processing',
              retryCount: 0,
              errorMessage: null,
            })
            .where(eq(generatedImageTable.id, generatedImage.id));

          // Fetch original uploaded image
          const [uploadedImage] = await db
            .select()
            .from(uploadedImageTable)
            .where(eq(uploadedImageTable.id, generatedImage.uploadedImageId))
            .limit(1);

          if (!uploadedImage) {
            throw new Error('Uploaded image not found');
          }

          // Fetch image from R2
          const getCommand = new GetObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: uploadedImage.r2Key,
          });
          const s3Response = await r2Client.send(getCommand);
          const imageBuffer = Buffer.from(await s3Response.Body!.transformToByteArray());

          // Convert to PNG
          const pngBuffer = await convertToPNG(imageBuffer);

          // Upload PNG to temp location
          const tempKey = `temp/${nanoid()}.png`;
          const putCommand = new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: tempKey,
            Body: pngBuffer,
            ContentType: 'image/png',
          });
          await r2Client.send(putCommand);

          // Generate presigned GET URL for temp PNG (valid 24 hours)
          const tempGetCommand = new GetObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: tempKey,
          });
          const tempImageUrl = await getSignedUrl(r2Client, tempGetCommand, {
            expiresIn: 86400, // 24 hours
          });

          // Get kid model image URL
          const kidModelNumber = Math.floor(Math.random() * 3) + 1;
          const kidModelPath = `/models/${batch.demographic}-${kidModelNumber}.jpg`;
          const kidModelUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}${kidModelPath}`;

          // Generate new prompt (reuse same background)
          const prompt = generatePrompt(
            batch.demographic as Demographic,
            batch.ageRange,
            generatedImage.background! as Background
          );

          // Submit new job to RunPod
          const runpodJobId = await submitJob({
            prompt,
            images: [kidModelUrl, tempImageUrl],
            size: '1024*1024',
            enable_safety_checker: true,
          });

          // Create new runpod_job record
          const runpodJobRecordId = nanoid();
          await db.insert(runpodJobTable).values({
            id: runpodJobRecordId,
            generatedImageId: generatedImage.id,
            jobId: runpodJobId,
            status: 'in_queue',
            prompt,
            background: generatedImage.background!,
          });

          // Update generated_image with new runpodJobId
          await db
            .update(generatedImageTable)
            .set({ runpodJobId: runpodJobRecordId })
            .where(eq(generatedImageTable.id, generatedImage.id));

          logInfo('Retry job submitted', `RunPod job ${runpodJobId} submitted for retry`, {
            batchId,
            generatedImageId: generatedImage.id,
          });

          return { success: true, jobId: runpodJobId };
        } catch (error) {
          logError('Retry job submission failed', error, {
            batchId,
            generatedImageId: generatedImage.id,
          });
          throw error;
        }
      })
    );

    // Wait for all retries to be submitted
    const results = await Promise.allSettled(retryPromises);
    const successfulRetries = results.filter(r => r.status === 'fulfilled').length;
    const failedRetries = results.filter(r => r.status === 'rejected').length;

    // 7. Update batch status to "processing"
    await db
      .update(batchTable)
      .set({
        status: 'processing',
        failedImages: batch.failedImages - successfulRetries,
        updatedAt: new Date(),
      })
      .where(eq(batchTable.id, batchId));

    logInfo('Batch retry started', `Batch ${batchId} retry initiated`, {
      batchId,
      retriedCount: successfulRetries,
      failedRetries,
    });

    // 8. Return success
    return NextResponse.json({
      success: true,
      retriedCount: successfulRetries,
      failedRetries,
    });
  } catch (error) {
    logError('Generation retry route error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
