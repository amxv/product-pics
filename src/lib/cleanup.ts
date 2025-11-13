import { ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { r2Client, R2_BUCKET_NAME } from './r2';
import { logError, logInfo } from './logger';

/**
 * Clean up temporary images from R2
 * Deletes objects in the temp/ prefix that are older than the specified threshold
 *
 * @param olderThanHours - Delete files older than this many hours (default: 24)
 */
export async function cleanupTempImages(olderThanHours: number = 24): Promise<void> {
  try {
    logInfo('Cleanup started', `Cleaning up temp images older than ${olderThanHours} hours`);

    const thresholdDate = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

    // List all objects in temp/ prefix
    const listCommand = new ListObjectsV2Command({
      Bucket: R2_BUCKET_NAME,
      Prefix: 'temp/',
    });

    const listResponse = await r2Client.send(listCommand);

    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      logInfo('Cleanup completed', 'No temp images found');
      return;
    }

    // Filter objects older than threshold
    const objectsToDelete = listResponse.Contents.filter((obj) => {
      if (!obj.LastModified) return false;
      return obj.LastModified < thresholdDate;
    });

    if (objectsToDelete.length === 0) {
      logInfo('Cleanup completed', 'No temp images older than threshold');
      return;
    }

    logInfo('Cleanup in progress', `Found ${objectsToDelete.length} temp images to delete`);

    // Delete in batches (max 1000 per batch for S3)
    const batchSize = 1000;
    for (let i = 0; i < objectsToDelete.length; i += batchSize) {
      const batch = objectsToDelete.slice(i, i + batchSize);

      const deleteCommand = new DeleteObjectsCommand({
        Bucket: R2_BUCKET_NAME,
        Delete: {
          Objects: batch.map((obj) => ({ Key: obj.Key })),
          Quiet: false,
        },
      });

      const deleteResponse = await r2Client.send(deleteCommand);

      if (deleteResponse.Errors && deleteResponse.Errors.length > 0) {
        logError('Cleanup errors', new Error('Some objects failed to delete'), {
          errors: deleteResponse.Errors,
        });
      }

      logInfo('Cleanup batch completed', `Deleted ${batch.length} temp images`);
    }

    logInfo('Cleanup completed', `Successfully cleaned up ${objectsToDelete.length} temp images`);
  } catch (error) {
    logError('Cleanup failed', error);
    throw error;
  }
}

/**
 * Example usage:
 * Can be called manually, via cron job, or API route
 *
 * ```typescript
 * // Clean up temp images older than 24 hours
 * await cleanupTempImages();
 *
 * // Clean up temp images older than 12 hours
 * await cleanupTempImages(12);
 * ```
 */
