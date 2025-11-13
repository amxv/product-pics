import { S3Client } from '@aws-sdk/client-s3';
import { Agent } from 'https';

// Configure S3 client for Cloudflare R2 with TLS workaround for macOS LibreSSL
export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true, // Required for R2 compatibility
  requestHandler: {
    httpsAgent: new Agent({
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.3',
    }),
  },
});

export const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!;
export const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

/**
 * Generate R2 key for uploaded image
 * Format: uploads/{userId}/{batchId}/{imageId}.png
 */
export function generateUploadKey(userId: string, batchId: string, imageId: string): string {
  return `uploads/${userId}/${batchId}/${imageId}.png`;
}

/**
 * Generate R2 key for generated image
 * Format: generated/{userId}/{batchId}/{imageId}.png
 */
export function generateGeneratedKey(userId: string, batchId: string, imageId: string): string {
  return `generated/${userId}/${batchId}/${imageId}.png`;
}

/**
 * Get public URL for an R2 object
 * If R2_PUBLIC_URL is configured, return the public URL
 * Otherwise, returns null (caller should use presigned URL)
 */
export function getPublicUrl(key: string): string | null {
  if (R2_PUBLIC_URL) {
    return `${R2_PUBLIC_URL}/${key}`;
  }
  return null;
}
