import { z } from 'zod';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type {
  userTable,
  batchTable,
  uploadedImageTable,
  generatedImageTable,
  runpodJobTable,
} from '../../db/schema';

// ===========================
// Enums and Type Aliases
// ===========================

// Demographic types
export const DEMOGRAPHICS = ['baby', 'boy', 'girl'] as const;
export type Demographic = typeof DEMOGRAPHICS[number];

// Batch status
export const BATCH_STATUSES = [
  'uploading',   // User is uploading images
  'uploaded',    // All images uploaded, ready to generate
  'processing',  // RunPod jobs in progress
  'completed',   // All images generated successfully
  'partial',     // Some images succeeded, some failed
  'failed'       // All images failed
] as const;
export type BatchStatus = typeof BATCH_STATUSES[number];

// Uploaded image status
export const UPLOAD_STATUSES = ['pending', 'uploaded', 'failed'] as const;
export type UploadStatus = typeof UPLOAD_STATUSES[number];

// Generated image status
export const GENERATION_STATUSES = ['pending', 'processing', 'completed', 'failed'] as const;
export type GenerationStatus = typeof GENERATION_STATUSES[number];

// RunPod job status
export const RUNPOD_JOB_STATUSES = ['in_queue', 'in_progress', 'completed', 'failed'] as const;
export type RunpodJobStatus = typeof RUNPOD_JOB_STATUSES[number];

// Natural backgrounds for variety
export const BACKGROUNDS = [
  'playground',
  'beach',
  'park',
  'backyard',
  'sports_field',
  'urban_plaza',
  'garden',
  'forest_trail'
] as const;
export type Background = typeof BACKGROUNDS[number];

// Supported image formats
export const SUPPORTED_FORMATS = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;
export type SupportedFormat = typeof SUPPORTED_FORMATS[number];

// ===========================
// Database Types
// ===========================

export type User = InferSelectModel<typeof userTable>;
export type Batch = InferSelectModel<typeof batchTable>;
export type UploadedImage = InferSelectModel<typeof uploadedImageTable>;
export type GeneratedImage = InferSelectModel<typeof generatedImageTable>;
export type RunpodJob = InferSelectModel<typeof runpodJobTable>;

export type InsertBatch = InferInsertModel<typeof batchTable>;
export type InsertUploadedImage = InferInsertModel<typeof uploadedImageTable>;
export type InsertGeneratedImage = InferInsertModel<typeof generatedImageTable>;
export type InsertRunpodJob = InferInsertModel<typeof runpodJobTable>;

// ===========================
// API Types
// ===========================

// Presigned URL request/response
export type PresignedUrlRequest = {
  batchId: string;
  fileName: string;
  fileType: SupportedFormat;
  fileSize: number; // bytes
};

export type PresignedUrlResponse = {
  presignedUrl: string;
  uploadedImageId: string;
  r2Key: string;
  expiresIn: number; // seconds
};

// Batch creation
export type CreateBatchRequest = {
  demographic: Demographic;
  ageRange: string; // "5-8" or "5"
};

export type CreateBatchResponse = {
  batchId: string;
  demographic: Demographic;
  ageRange: string;
};

// Batch with images (for UI)
export type BatchWithImages = Batch & {
  uploadedImages: UploadedImage[];
  generatedImages: (GeneratedImage & {
    uploadedImage: UploadedImage;
  })[];
};

// Batch progress (for polling)
export type BatchProgress = {
  batchId: string;
  status: BatchStatus;
  totalImages: number;
  completedImages: number;
  failedImages: number;
  processingImages: number;
};

// ===========================
// RunPod API Types
// ===========================

// RunPod job submission
export type RunpodSubmitRequest = {
  input: {
    prompt: string;
    images: string[]; // URLs to images
    size: '1024*1024' | '1536*1536' | '2048*2048' | '4096*4096';
    enable_safety_checker?: boolean;
  };
};

export type RunpodSubmitResponse = {
  id: string; // Job ID
  status: 'IN_QUEUE';
};

// RunPod status check
export type RunpodStatusResponse = {
  id: string;
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  output?: {
    result: string; // Image URL
  };
  error?: string;
};

// ===========================
// Validation Schemas (Zod)
// ===========================

// Age range validation
export const ageRangeSchema = z.string().refine(
  (val) => {
    // Single age: "5"
    if (/^\d+$/.test(val)) {
      const age = parseInt(val, 10);
      return age >= 0 && age <= 18;
    }
    // Age range: "5-8"
    if (/^\d+-\d+$/.test(val)) {
      const [min, max] = val.split('-').map(n => parseInt(n, 10));
      return min >= 0 && max <= 18 && min <= max;
    }
    return false;
  },
  { message: 'Age must be 0-18 or a range like "5-8"' }
);

// Batch creation validation
export const createBatchSchema = z.object({
  demographic: z.enum(DEMOGRAPHICS),
  ageRange: ageRangeSchema,
});

// Presigned URL request validation
export const presignedUrlRequestSchema = z.object({
  batchId: z.string().min(1),
  fileName: z.string().min(1),
  fileType: z.enum(SUPPORTED_FORMATS),
  fileSize: z.number().int().positive().max(20 * 1024 * 1024), // 20MB max
});
