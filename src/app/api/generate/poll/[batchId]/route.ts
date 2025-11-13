import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db, batchTable, generatedImageTable, runpodJobTable, uploadedImageTable } from '../../../../../../db';
import { eq, and, sql } from 'drizzle-orm';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, R2_BUCKET_NAME, generateGeneratedKey } from '@/lib/r2';
import { getJobStatus, downloadResult } from '@/lib/runpod';
import { generatePrompt } from '@/lib/prompt';
import { logError, logInfo, logWarning } from '@/lib/logger';
import pLimit from 'p-limit';
import type { BatchProgress, Demographic, Background } from '@/lib/types';

interface RouteParams {
  params: Promise<{
    batchId: string;
  }>;
}

// Exponential backoff delays (in milliseconds)
const RETRY_DELAYS = [1000, 2000, 4000]; // 1s, 2s, 4s

export async function GET(request: NextRequest, { params }: RouteParams) {
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

    // 2. Get batchId from params
    const { batchId } = await params;

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

    // 5. Check for timeout (30 minutes since processing started)
    const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
    const processingStartTime = batch.updatedAt.getTime();
    const elapsedMs = Date.now() - processingStartTime;

    if (batch.status === 'processing' && elapsedMs > TIMEOUT_MS) {
      logWarning('Batch timeout', `Batch ${batchId} exceeded 30-minute timeout`, {
        batchId,
        elapsedMinutes: Math.floor(elapsedMs / 60000),
      });

      // Mark all remaining processing images as failed
      await db
        .update(generatedImageTable)
        .set({
          status: 'failed',
          errorMessage: 'Timeout: Generation exceeded 30 minutes',
        })
        .where(
          and(
            eq(generatedImageTable.batchId, batchId),
            eq(generatedImageTable.status, 'processing')
          )
        );

      // Count images
      const allImages = await db
        .select()
        .from(generatedImageTable)
        .where(eq(generatedImageTable.batchId, batchId));

      const completedCount = allImages.filter(img => img.status === 'completed').length;
      const failedCount = allImages.filter(img => img.status === 'failed').length;

      // Update batch status
      const newStatus = completedCount > 0 ? 'partial' : 'failed';
      await db
        .update(batchTable)
        .set({
          status: newStatus,
          completedImages: completedCount,
          failedImages: failedCount,
          completedAt: new Date(),
        })
        .where(eq(batchTable.id, batchId));

      return NextResponse.json({
        batchId: batch.id,
        status: newStatus,
        totalImages: batch.totalImages,
        completedImages: completedCount,
        failedImages: failedCount,
        processingImages: 0,
      } as BatchProgress);
    }

    // 6. Fetch all processing images
    const processingImages = await db
      .select()
      .from(generatedImageTable)
      .where(
        and(
          eq(generatedImageTable.batchId, batchId),
          eq(generatedImageTable.status, 'processing')
        )
      );

    if (processingImages.length === 0) {
      // All images are done, return current progress
      const _allImages = await db
        .select()
        .from(generatedImageTable)
        .where(eq(generatedImageTable.batchId, batchId));

      return NextResponse.json({
        batchId: batch.id,
        status: batch.status,
        totalImages: batch.totalImages,
        completedImages: batch.completedImages,
        failedImages: batch.failedImages,
        processingImages: 0,
      } as BatchProgress);
    }

    // 7. Poll RunPod status for each processing image (with concurrency limit)
    const limit = pLimit(10); // Max 10 concurrent status checks

    const statusCheckPromises = processingImages.map(generatedImage =>
      limit(async () => {
        try {
          // Fetch latest runpod_job for this generated_image
          const [runpodJob] = await db
            .select()
            .from(runpodJobTable)
            .where(eq(runpodJobTable.id, generatedImage.runpodJobId!))
            .limit(1);

          if (!runpodJob) {
            logWarning('RunPod job not found', `No job record found for generated image ${generatedImage.id}`);
            return;
          }

          // Get job status from RunPod
          const statusResponse = await getJobStatus(runpodJob.jobId);

          // Handle different statuses
          if (statusResponse.status === 'IN_QUEUE' || statusResponse.status === 'IN_PROGRESS') {
            // No action needed, still processing
            return;
          }

          if (statusResponse.status === 'COMPLETED') {
            // Download result and upload to R2
            const resultUrl = statusResponse.output?.result;
            if (!resultUrl) {
              throw new Error('No result URL in completed job');
            }

            const imageBuffer = await downloadResult(resultUrl);

            // Upload to R2 at generated key
            const generatedKey = generateGeneratedKey(batch.userId, batchId, generatedImage.id);
            const putCommand = new PutObjectCommand({
              Bucket: R2_BUCKET_NAME,
              Key: generatedKey,
              Body: imageBuffer,
              ContentType: 'image/png',
            });
            await r2Client.send(putCommand);

            // Update generated_image status (only if still processing)
            const statusUpdateResult = await db
              .update(generatedImageTable)
              .set({
                status: 'completed',
                r2Key: generatedKey,
                completedAt: new Date(),
              })
              .where(
                and(
                  eq(generatedImageTable.id, generatedImage.id),
                  eq(generatedImageTable.status, 'processing')
                )
              );

            // Only increment counter if status was actually updated
            if (statusUpdateResult.rowsAffected > 0) {
              // Update runpod_job status
              await db
                .update(runpodJobTable)
                .set({
                  status: 'completed',
                  resultUrl,
                  completedAt: new Date(),
                })
                .where(eq(runpodJobTable.id, runpodJob.id));

              // Increment batch completed count (atomic)
              await db
                .update(batchTable)
                .set({
                  completedImages: sql`${batchTable.completedImages} + 1`,
                })
                .where(eq(batchTable.id, batchId));
            }

            logInfo('Job completed', `Image ${generatedImage.id} completed`, {
              batchId,
              generatedImageId: generatedImage.id,
            });
          } else if (statusResponse.status === 'FAILED') {
            // Handle failure with retry logic
            const currentRetryCount = generatedImage.retryCount;

            if (currentRetryCount < 3) {
              // Retry with exponential backoff
              const delay = RETRY_DELAYS[currentRetryCount] || 4000;
              await new Promise(resolve => setTimeout(resolve, delay));

              logInfo('Retrying failed job', `Retry attempt ${currentRetryCount + 1}/3`, {
                batchId,
                generatedImageId: generatedImage.id,
                delay,
              });

              // Resubmit job
              // Note: We need the original uploaded image to regenerate
              const [uploadedImage] = await db
                .select()
                .from(uploadedImageTable)
                .where(eq(uploadedImageTable.id, generatedImage.uploadedImageId))
                .limit(1);

              if (!uploadedImage) {
                throw new Error('Uploaded image not found for retry');
              }

              // Fetch batch again for demographic/ageRange
              const [freshBatch] = await db
                .select()
                .from(batchTable)
                .where(eq(batchTable.id, batchId))
                .limit(1);

              // Generate new prompt (reuse same background)
              const _prompt = generatePrompt(
                freshBatch!.demographic as Demographic,
                freshBatch!.ageRange,
                generatedImage.background! as Background
              );

              // TODO: Resubmit to RunPod (simplified for now - would need temp image URL again)
              // For now, just increment retry count and mark as failed after 3 tries (only if still processing)
              const retryUpdateResult = await db
                .update(generatedImageTable)
                .set({
                  retryCount: currentRetryCount + 1,
                  status: currentRetryCount + 1 >= 3 ? 'failed' : 'processing',
                  errorMessage: currentRetryCount + 1 >= 3 ? statusResponse.error || 'Job failed after 3 retries' : null,
                })
                .where(
                  and(
                    eq(generatedImageTable.id, generatedImage.id),
                    eq(generatedImageTable.status, 'processing')
                  )
                );

              if (currentRetryCount + 1 >= 3 && retryUpdateResult.rowsAffected > 0) {
                // Update runpod_job status
                await db
                  .update(runpodJobTable)
                  .set({
                    status: 'failed',
                    errorMessage: statusResponse.error || 'Job failed after 3 retries',
                  })
                  .where(eq(runpodJobTable.id, runpodJob.id));

                // Increment batch failed count (atomic)
                await db
                  .update(batchTable)
                  .set({
                    failedImages: sql`${batchTable.failedImages} + 1`,
                  })
                  .where(eq(batchTable.id, batchId));

                logError('Job failed permanently', new Error(statusResponse.error || 'Unknown error'), {
                  batchId,
                  generatedImageId: generatedImage.id,
                  retries: currentRetryCount + 1,
                });
              }
            } else {
              // Already at max retries, mark as failed (only if still processing)
              const failedUpdateResult = await db
                .update(generatedImageTable)
                .set({
                  status: 'failed',
                  errorMessage: statusResponse.error || 'Job failed after 3 retries',
                })
                .where(
                  and(
                    eq(generatedImageTable.id, generatedImage.id),
                    eq(generatedImageTable.status, 'processing')
                  )
                );

              // Only increment counter if status was actually updated
              if (failedUpdateResult.rowsAffected > 0) {
                await db
                  .update(runpodJobTable)
                  .set({
                    status: 'failed',
                    errorMessage: statusResponse.error || 'Job failed',
                  })
                  .where(eq(runpodJobTable.id, runpodJob.id));

                // Increment batch failed count (atomic)
                await db
                  .update(batchTable)
                  .set({
                    failedImages: sql`${batchTable.failedImages} + 1`,
                  })
                  .where(eq(batchTable.id, batchId));

                logError('Job failed permanently', new Error(statusResponse.error || 'Unknown error'), {
                  batchId,
                  generatedImageId: generatedImage.id,
                  retries: currentRetryCount,
                });
              }
            }
          }
        } catch (error) {
          logError('Status check error', error, {
            batchId,
            generatedImageId: generatedImage.id,
          });
        }
      })
    );

    await Promise.allSettled(statusCheckPromises);

    // 8. Check if all images are complete
    const allImages = await db
      .select()
      .from(generatedImageTable)
      .where(eq(generatedImageTable.batchId, batchId));

    const completedCount = allImages.filter(img => img.status === 'completed').length;
    const failedCount = allImages.filter(img => img.status === 'failed').length;
    const processingCount = allImages.filter(img => img.status === 'processing').length;

    // Update batch status if all done
    if (processingCount === 0) {
      let newStatus: 'completed' | 'partial' | 'failed' = 'completed';
      if (failedCount > 0 && completedCount > 0) {
        newStatus = 'partial';
      } else if (failedCount > 0 && completedCount === 0) {
        newStatus = 'failed';
      }

      await db
        .update(batchTable)
        .set({
          status: newStatus,
          completedImages: completedCount,
          failedImages: failedCount,
          completedAt: new Date(),
        })
        .where(eq(batchTable.id, batchId));

      logInfo('Batch complete', `Batch ${batchId} finished with status ${newStatus}`, {
        batchId,
        completedCount,
        failedCount,
      });

      return NextResponse.json({
        batchId: batch.id,
        status: newStatus,
        totalImages: batch.totalImages,
        completedImages: completedCount,
        failedImages: failedCount,
        processingImages: 0,
      } as BatchProgress);
    }

    // Return current progress
    return NextResponse.json({
      batchId: batch.id,
      status: 'processing',
      totalImages: batch.totalImages,
      completedImages: completedCount,
      failedImages: failedCount,
      processingImages: processingCount,
    } as BatchProgress);
  } catch (error) {
    logError('Generation poll route error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
