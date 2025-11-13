'use server';

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db, uploadedImageTable, batchTable } from '../../db';
import { eq } from 'drizzle-orm';

/**
 * Mark upload as failed
 * Called by client if upload to R2 fails
 */
export async function markUploadFailed(
  uploadedImageId: string,
  errorMessage: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate session
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { success: false, error: 'Unauthorized' };
    }

    // Fetch uploaded_image
    const [uploadedImage] = await db
      .select()
      .from(uploadedImageTable)
      .where(eq(uploadedImageTable.id, uploadedImageId))
      .limit(1);

    if (!uploadedImage) {
      return { success: false, error: 'Image not found' };
    }

    // Fetch batch to verify ownership
    const [batch] = await db
      .select()
      .from(batchTable)
      .where(eq(batchTable.id, uploadedImage.batchId))
      .limit(1);

    if (!batch) {
      return { success: false, error: 'Batch not found' };
    }

    // Verify user owns batch
    if (batch.userId !== session.user.id) {
      return { success: false, error: 'You do not have permission to update this image' };
    }

    // Update status to failed
    await db
      .update(uploadedImageTable)
      .set({
        status: 'failed',
        errorMessage,
      })
      .where(eq(uploadedImageTable.id, uploadedImageId));

    return { success: true };
  } catch (error) {
    console.error('Error marking upload failed:', error);
    return { success: false, error: 'Failed to mark upload as failed' };
  }
}
