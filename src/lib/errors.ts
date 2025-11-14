/**
 * Centralized error handling utilities
 * Provides consistent error messages and custom error classes
 */

export const ERROR_MESSAGES = {
  // Authentication errors
  UNAUTHORIZED: 'You must be signed in to access this resource',
  SESSION_EXPIRED: 'Your session has expired. Please sign in again',

  // Batch errors
  BATCH_NOT_FOUND: 'Batch not found',
  BATCH_NOT_OWNED: 'You do not have permission to access this batch',
  BATCH_NOT_READY: 'Batch is not ready for download. Please wait for generation to complete.',

  // Image errors
  NO_IMAGES: 'No images available for download',
  IMAGE_NOT_FOUND: 'Image not found',
  INVALID_IMAGE_FORMAT: 'Invalid image format. Supported formats: JPG, PNG, WebP, HEIC',
  IMAGE_TOO_LARGE: 'Image file size exceeds 20MB limit',

  // Upload errors
  UPLOAD_FAILED: 'Failed to upload image. Please try again.',
  PRESIGNED_URL_FAILED: 'Failed to generate upload URL. Please try again.',

  // Generation errors
  GENERATION_FAILED: 'Failed to generate image. Please try again.',
  GENERATION_TIMEOUT: 'Image generation timed out. Please try again.',
  RUNPOD_API_ERROR: 'RunPod API error. Please try again later.',

  // Download errors
  DOWNLOAD_FAILED: 'Failed to generate download. Please try again.',
  ZIP_CREATION_FAILED: 'Failed to create zip file. Please try again.',
  R2_FETCH_FAILED: 'Failed to fetch image from storage. Please try again.',

  // Validation errors
  INVALID_INPUT: 'Invalid input provided',
  BATCH_LIMIT_EXCEEDED: 'Batch size exceeds maximum of 100 images',
  ACCOUNT_LIMIT_EXCEEDED: 'Account has reached the lifetime limit of 600 photos',

  // General errors
  INTERNAL_ERROR: 'An internal error occurred. Please try again later.',
  UNKNOWN_ERROR: 'An unknown error occurred. Please try again.',
} as const;

/**
 * Custom error class for application-specific errors
 * Includes HTTP status code and optional error code
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code?: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code?: string,
    isOperational: boolean = true
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;

    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to JSON for API responses
   */
  toJSON() {
    return {
      error: this.message,
      code: this.code,
      statusCode: this.statusCode,
    };
  }
}

/**
 * Helper function to create common HTTP errors
 */
export const createError = {
  unauthorized: (message: string = ERROR_MESSAGES.UNAUTHORIZED) =>
    new AppError(message, 401, 'UNAUTHORIZED'),

  forbidden: (message: string = ERROR_MESSAGES.BATCH_NOT_OWNED) =>
    new AppError(message, 403, 'FORBIDDEN'),

  notFound: (message: string = ERROR_MESSAGES.BATCH_NOT_FOUND) =>
    new AppError(message, 404, 'NOT_FOUND'),

  badRequest: (message: string = ERROR_MESSAGES.INVALID_INPUT) =>
    new AppError(message, 400, 'BAD_REQUEST'),

  internal: (message: string = ERROR_MESSAGES.INTERNAL_ERROR) =>
    new AppError(message, 500, 'INTERNAL_ERROR'),
};
