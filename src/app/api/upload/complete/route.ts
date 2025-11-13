import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db, uploadedImageTable, batchTable } from '../../../../../db';
import { eq, and, sql } from 'drizzle-orm';
import { z } from 'zod';

// Request body schema
const uploadCompleteSchema = z.object({
  uploadedImageId: z.string().min(1),
  success: z.boolean(),
  errorMessage: z.string().optional(),
});

/**
 * POST /api/upload/complete
 * Mark upload as complete after client successfully uploads to R2
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
    const validation = uploadCompleteSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { uploadedImageId, success, errorMessage } = validation.data;

    // Fetch uploaded_image record
    const [uploadedImage] = await db
      .select()
      .from(uploadedImageTable)
      .where(eq(uploadedImageTable.id, uploadedImageId))
      .limit(1);

    if (!uploadedImage) {
      return NextResponse.json(
        { error: 'Uploaded image not found' },
        { status: 404 }
      );
    }

    // Fetch batch to verify ownership
    const [batch] = await db
      .select()
      .from(batchTable)
      .where(eq(batchTable.id, uploadedImage.batchId))
      .limit(1);

    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    // Verify user owns the batch
    if (batch.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'You do not have permission to update this image' },
        { status: 403 }
      );
    }

    // Check if already processed (idempotency)
    if (uploadedImage.status !== 'pending') {
      return NextResponse.json(
        { success: true, message: 'Already processed' },
        { status: 200 }
      );
    }

    // Update uploaded_image status (only if still pending)
    if (success) {
      const uploadUpdateResult = await db
        .update(uploadedImageTable)
        .set({ status: 'uploaded' })
        .where(
          and(
            eq(uploadedImageTable.id, uploadedImageId),
            eq(uploadedImageTable.status, 'pending')
          )
        )
        .returning();

      // Increment batch totalImages count only if status was actually updated
      if (uploadUpdateResult.length > 0) {
        await db
          .update(batchTable)
          .set({
            totalImages: sql`${batchTable.totalImages} + 1`,
          })
          .where(eq(batchTable.id, uploadedImage.batchId));
      }
    } else {
      await db
        .update(uploadedImageTable)
        .set({
          status: 'failed',
          errorMessage: errorMessage || 'Upload failed',
        })
        .where(
          and(
            eq(uploadedImageTable.id, uploadedImageId),
            eq(uploadedImageTable.status, 'pending')
          )
        );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error marking upload complete:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
