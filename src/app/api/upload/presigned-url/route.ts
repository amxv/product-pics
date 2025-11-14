import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { nanoid } from 'nanoid';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { auth } from '@/lib/auth';
import { db, batchTable, uploadedImageTable, userTable } from '../../../../../db';
import { r2Client, R2_BUCKET_NAME, generateUploadKey } from '@/lib/r2';
import { presignedUrlRequestSchema, type PresignedUrlResponse } from '@/lib/types';
import { eq, count } from 'drizzle-orm';

/**
 * POST /api/upload/presigned-url
 * Generate presigned URL for direct R2 upload
 */
export async function POST(request: NextRequest) {
  try {
    // Validate session
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validation = presignedUrlRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { batchId, fileName, fileType, fileSize } = validation.data;

    // Fetch batch from database
    const [batch] = await db
      .select()
      .from(batchTable)
      .where(eq(batchTable.id, batchId))
      .limit(1);

    // Verify batch exists
    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    // Verify user owns batch
    if (batch.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'You do not have permission to upload to this batch' },
        { status: 403 }
      );
    }

    // Verify batch status is "uploading"
    if (batch.status !== 'uploading') {
      return NextResponse.json(
        { error: 'Batch is not in uploading state' },
        { status: 400 }
      );
    }

    // Fetch user to check account limits
    const [user] = await db
      .select()
      .from(userTable)
      .where(eq(userTable.id, session.user.id))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check account-level photo limit
    if (user.totalPhotosGenerated >= user.photoGenerationLimit) {
      return NextResponse.json(
        {
          error: `Account has reached the lifetime limit of ${user.photoGenerationLimit} photos. You have generated ${user.totalPhotosGenerated} photos.`,
          code: 'ACCOUNT_LIMIT_EXCEEDED',
          details: {
            limit: user.photoGenerationLimit,
            used: user.totalPhotosGenerated,
            remaining: 0
          }
        },
        { status: 403 }
      );
    }

    // Count existing images in batch
    const [{ count: imageCount }] = await db
      .select({ count: count() })
      .from(uploadedImageTable)
      .where(eq(uploadedImageTable.batchId, batchId));

    // Verify total images < 100
    if (imageCount >= 100) {
      return NextResponse.json(
        { error: 'Batch has reached the maximum of 100 images' },
        { status: 400 }
      );
    }

    // Generate unique image ID
    const imageId = nanoid();

    // Create uploaded_image record with status="pending"
    await db.insert(uploadedImageTable).values({
      id: imageId,
      batchId,
      originalFilename: fileName,
      r2Key: generateUploadKey(session.user.id, batchId, imageId),
      fileSize,
      mimeType: fileType,
      status: 'pending',
    });

    // Generate R2 key
    const r2Key = generateUploadKey(session.user.id, batchId, imageId);

    // Generate presigned PUT URL (15-minute expiry)
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: r2Key,
      ContentType: fileType,
    });

    const presignedUrl = await getSignedUrl(r2Client, command, {
      expiresIn: 900, // 15 minutes
    });

    // Return presigned URL and metadata
    const response: PresignedUrlResponse = {
      presignedUrl,
      uploadedImageId: imageId,
      r2Key,
      expiresIn: 900,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
