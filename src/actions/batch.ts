'use server';

import { headers } from 'next/headers';
import { DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { auth } from '@/lib/auth';
import { db, batchTable } from '../../db';
import { r2Client, R2_BUCKET_NAME } from '@/lib/r2';
import { eq } from 'drizzle-orm';
import type { BatchStatus } from '@/lib/types';

/**
 * Delete a batch and all associated images
 */
export async function deleteBatch(batchId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate session
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { success: false, error: 'Unauthorized' };
    }

    // Fetch batch
    const [batch] = await db
      .select()
      .from(batchTable)
      .where(eq(batchTable.id, batchId))
      .limit(1);

    if (!batch) {
      return { success: false, error: 'Batch not found' };
    }

    // Verify user owns batch
    if (batch.userId !== session.user.id) {
      return { success: false, error: 'You do not have permission to delete this batch' };
    }

    // Delete batch record (CASCADE will handle uploaded_image and generated_image records)
    await db.delete(batchTable).where(eq(batchTable.id, batchId));

    // Delete R2 objects for this batch
    try {
      // List all objects with prefix for this user's batch
      const prefix = `uploads/${session.user.id}/${batchId}/`;
      const listCommand = new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: prefix,
      });

      const listedObjects = await r2Client.send(listCommand);

      if (listedObjects.Contents && listedObjects.Contents.length > 0) {
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: R2_BUCKET_NAME,
          Delete: {
            Objects: listedObjects.Contents.map((obj) => ({ Key: obj.Key })),
          },
        });

        await r2Client.send(deleteCommand);
      }

      // Also delete generated images if any
      const generatedPrefix = `generated/${session.user.id}/${batchId}/`;
      const listGeneratedCommand = new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: generatedPrefix,
      });

      const listedGenerated = await r2Client.send(listGeneratedCommand);

      if (listedGenerated.Contents && listedGenerated.Contents.length > 0) {
        const deleteGeneratedCommand = new DeleteObjectsCommand({
          Bucket: R2_BUCKET_NAME,
          Delete: {
            Objects: listedGenerated.Contents.map((obj) => ({ Key: obj.Key })),
          },
        });

        await r2Client.send(deleteGeneratedCommand);
      }
    } catch (r2Error) {
      console.error('Error deleting R2 objects:', r2Error);
      // Continue even if R2 deletion fails
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting batch:', error);
    return { success: false, error: 'Failed to delete batch' };
  }
}

/**
 * Update batch status
 */
export async function updateBatchStatus(
  batchId: string,
  status: BatchStatus
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate session
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { success: false, error: 'Unauthorized' };
    }

    // Fetch batch
    const [batch] = await db
      .select()
      .from(batchTable)
      .where(eq(batchTable.id, batchId))
      .limit(1);

    if (!batch) {
      return { success: false, error: 'Batch not found' };
    }

    // Verify user owns batch
    if (batch.userId !== session.user.id) {
      return { success: false, error: 'You do not have permission to update this batch' };
    }

    // Update batch status
    const updateData: { status: BatchStatus; updatedAt?: Date } = {
      status,
    };

    // If status is "uploaded", also set updatedAt to now
    if (status === 'uploaded') {
      updateData.updatedAt = new Date();
    }

    await db.update(batchTable).set(updateData).where(eq(batchTable.id, batchId));

    return { success: true };
  } catch (error) {
    console.error('Error updating batch status:', error);
    return { success: false, error: 'Failed to update batch status' };
  }
}
