/**
 * Zip generation utilities for batch downloads
 * Generates zip files on-demand with streaming for memory efficiency
 */

import archiver from 'archiver';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { db, batchTable, uploadedImageTable, generatedImageTable } from '../../db';
import { eq } from 'drizzle-orm';
import { r2Client, R2_BUCKET_NAME } from './r2';
import { AppError, createError, ERROR_MESSAGES } from './errors';
import { logError } from './logger';
import type { Batch, UploadedImage, GeneratedImage } from './types';

/**
 * Convert a stream to a buffer
 * @param stream - The readable stream to convert
 * @returns Promise that resolves to a Buffer
 */
async function streamToBuffer(stream: Readable | ReadableStream | Blob): Promise<Buffer> {
  // Handle different stream types
  if (stream instanceof Blob) {
    const arrayBuffer = await stream.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  if (!(stream instanceof Readable)) {
    // Convert ReadableStream to Node.js Readable
    const reader = (stream as ReadableStream).getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }

    return Buffer.concat(chunks);
  }

  // Handle Node.js Readable stream
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * Handle duplicate filenames by appending numeric suffixes
 * @param filename - The desired filename
 * @param usedFilenames - Set of already used filenames
 * @returns A unique filename
 */
export function handleDuplicateFilename(
  filename: string,
  usedFilenames: Set<string>
): string {
  let uniqueFilename = filename;
  let counter = 1;

  // If filename is already unique, add it and return
  if (!usedFilenames.has(uniqueFilename)) {
    usedFilenames.add(uniqueFilename);
    return uniqueFilename;
  }

  // Extract name and extension
  const lastDotIndex = filename.lastIndexOf('.');
  const name = lastDotIndex > 0 ? filename.substring(0, lastDotIndex) : filename;
  const extension = lastDotIndex > 0 ? filename.substring(lastDotIndex) : '';

  // Try adding _1, _2, _3, etc. until we find a unique name
  while (usedFilenames.has(uniqueFilename)) {
    uniqueFilename = `${name}_${counter}${extension}`;
    counter++;
  }

  usedFilenames.add(uniqueFilename);
  return uniqueFilename;
}

/**
 * Generate a summary report for the batch
 * @param batch - The batch data
 * @param generatedImages - All generated images (successful and failed)
 * @param uploadedImages - All uploaded images
 * @returns Formatted text report
 */
export function generateSummaryReport(
  batch: Batch,
  generatedImages: GeneratedImage[],
  uploadedImages: UploadedImage[]
): string {
  const completedImages = generatedImages.filter((img) => img.status === 'completed');
  const failedImages = generatedImages.filter((img) => img.status === 'failed');

  // Create a map of uploaded images by ID for easy lookup
  const uploadedImageMap = new Map(
    uploadedImages.map((img) => [img.id, img])
  );

  // Format demographic label
  const demographicLabel =
    batch.demographic.charAt(0).toUpperCase() + batch.demographic.slice(1);

  // Format age label
  const ageLabel = batch.ageRange.includes('-')
    ? `${batch.ageRange.split('-')[0]}-${batch.ageRange.split('-')[1]} years`
    : `${batch.ageRange} years`;

  // Build the report
  let report = `AI PRODUCT PHOTO GENERATION - SUMMARY REPORT
============================================

Batch ID: ${batch.id}
Generated: ${new Date().toLocaleString()}
Demographic: ${demographicLabel}
Age Range: ${ageLabel}

STATISTICS
----------
Total Images: ${batch.totalImages}
Successfully Generated: ${batch.completedImages}
Failed: ${batch.failedImages}
Success Rate: ${batch.totalImages > 0 ? Math.round((batch.completedImages / batch.totalImages) * 100) : 0}%

`;

  // List successful images
  if (completedImages.length > 0) {
    report += `SUCCESSFUL IMAGES\n`;
    report += `-----------------\n`;
    completedImages.forEach((img, index) => {
      const uploadedImage = uploadedImageMap.get(img.uploadedImageId);
      const originalFilename = uploadedImage?.originalFilename || 'unknown';
      const background = img.background || 'random';
      report += `${index + 1}. ${originalFilename} → ${originalFilename.replace(/\.[^.]+$/, '')}_generated.png (Background: ${background})\n`;
    });
    report += '\n';
  }

  // List failed images
  if (failedImages.length > 0) {
    report += `FAILED IMAGES\n`;
    report += `-------------\n`;
    failedImages.forEach((img, index) => {
      const uploadedImage = uploadedImageMap.get(img.uploadedImageId);
      const originalFilename = uploadedImage?.originalFilename || 'unknown';
      const errorMessage = img.errorMessage || 'Unknown error';
      report += `${index + 1}. ${originalFilename} - Error: ${errorMessage}\n`;
    });
    report += '\n';
  }

  // Add notes
  report += `NOTES\n`;
  report += `-----\n`;
  report += `- All generated images are in PNG format at 1024×1024 resolution\n`;
  report += `- Images are retained for 30 days from generation date\n`;
  report += `- For support or questions, please contact your administrator\n`;
  report += `\n`;
  report += `Generated by AI Product Photo Generator\n`;
  report += `Timestamp: ${new Date().toISOString()}\n`;

  return report;
}

/**
 * Create a zip file for a batch download
 * @param batchId - The batch ID to download
 * @param userId - The user ID (for ownership verification)
 * @returns Object containing the zip stream and filename
 */
export async function createBatchZip(
  batchId: string,
  userId: string
): Promise<{ stream: archiver.Archiver; filename: string }> {
  try {
    // Fetch batch from database
    const [batch] = await db
      .select()
      .from(batchTable)
      .where(eq(batchTable.id, batchId))
      .limit(1);

    if (!batch) {
      throw createError.notFound(ERROR_MESSAGES.BATCH_NOT_FOUND);
    }

    // Verify ownership
    if (batch.userId !== userId) {
      throw createError.forbidden(ERROR_MESSAGES.BATCH_NOT_OWNED);
    }

    // Verify batch status
    if (batch.status !== 'completed' && batch.status !== 'partial') {
      throw createError.badRequest(ERROR_MESSAGES.BATCH_NOT_READY);
    }

    // Fetch all generated images with status="completed"
    const generatedImages = await db
      .select()
      .from(generatedImageTable)
      .where(eq(generatedImageTable.batchId, batchId));

    const completedImages = generatedImages.filter(
      (img) => img.status === 'completed' && img.r2Key
    );

    // Check if there are any images to download
    if (completedImages.length === 0) {
      throw createError.badRequest(ERROR_MESSAGES.NO_IMAGES);
    }

    // Fetch corresponding uploaded images for original filenames
    const uploadedImages = await db
      .select()
      .from(uploadedImageTable)
      .where(eq(uploadedImageTable.batchId, batchId));

    // Create a map for quick lookup
    const uploadedImageMap = new Map(
      uploadedImages.map((img) => [img.id, img])
    );

    // Create archiver instance
    const archive = archiver('zip', {
      zlib: { level: 6 }, // Compression level (0-9)
    });

    // Track used filenames for duplicate detection
    const usedFilenames = new Set<string>();

    // Add each generated image to the zip
    for (const generatedImage of completedImages) {
      try {
        // Get original filename
        const uploadedImage = uploadedImageMap.get(generatedImage.uploadedImageId);
        if (!uploadedImage) {
          logError('Zip Generation', new Error('Uploaded image not found'), {
            generatedImageId: generatedImage.id,
            uploadedImageId: generatedImage.uploadedImageId,
          });
          continue; // Skip this image
        }

        // Generate output filename: {originalFilename}_generated.png
        const originalName = uploadedImage.originalFilename.replace(/\.[^.]+$/, ''); // Remove extension
        let outputFilename = `${originalName}_generated.png`;

        // Handle duplicate filenames
        outputFilename = handleDuplicateFilename(outputFilename, usedFilenames);

        // Fetch image from R2
        const getObjectCommand = new GetObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: generatedImage.r2Key!,
        });

        const response = await r2Client.send(getObjectCommand);

        if (!response.Body) {
          logError('Zip Generation', new Error('R2 response body is empty'), {
            r2Key: generatedImage.r2Key,
          });
          continue; // Skip this image
        }

        // Convert stream to buffer
        const imageBuffer = await streamToBuffer(response.Body as Readable);

        // Append to archive
        archive.append(imageBuffer, { name: outputFilename });
      } catch (error) {
        // Log error but continue processing other images
        logError('Zip Generation - Image Fetch', error as Error, {
          generatedImageId: generatedImage.id,
          r2Key: generatedImage.r2Key,
        });
        // Continue to next image
      }
    }

    // Generate summary report
    const summaryReport = generateSummaryReport(
      batch,
      generatedImages,
      uploadedImages
    );

    // Append summary to zip
    archive.append(summaryReport, { name: 'SUMMARY.txt' });

    // Finalize the archive (no more files will be added)
    archive.finalize();

    // Generate filename: batch-{batchId}-{timestamp}.zip
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = `batch-${batchId.substring(0, 8)}-${timestamp}.zip`;

    return {
      stream: archive,
      filename,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logError('Zip Generation', error as Error, { batchId, userId });
    throw createError.internal(ERROR_MESSAGES.ZIP_CREATION_FAILED);
  }
}
