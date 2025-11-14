/**
 * Reusable validation functions for consistent error handling
 * All validation functions throw AppError on failure
 */

import { createError, ERROR_MESSAGES } from './errors';
import type { Batch, BatchStatus, User } from './types';

// Type for the return value of auth.api.getSession()
// This includes both session and user information
type AuthSession = {
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
    token: string;
    createdAt: Date;
    updatedAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
  };
  user: {
    id: string;
    email: string;
    emailVerified: boolean;
    username?: string | null;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    image?: string | null;
  };
} | null;

/**
 * Validate that a session exists (user is authenticated)
 * @param session - The session object to validate
 * @returns The validated session
 * @throws AppError(401) if session is null or invalid
 */
export function validateSession(session: AuthSession): NonNullable<AuthSession> {
  if (!session || !session.user) {
    throw createError.unauthorized(ERROR_MESSAGES.UNAUTHORIZED);
  }
  return session;
}

/**
 * Validate that a user owns a batch
 * @param batch - The batch to validate ownership of
 * @param userId - The user ID to check against
 * @throws AppError(403) if user does not own the batch
 */
export function validateBatchOwnership(batch: Batch, userId: string): void {
  if (batch.userId !== userId) {
    throw createError.forbidden(ERROR_MESSAGES.BATCH_NOT_OWNED);
  }
}

/**
 * Validate that a batch has one of the allowed statuses
 * @param batch - The batch to validate
 * @param allowedStatuses - Array of allowed batch statuses
 * @throws AppError(400) if batch status is not in allowed list
 */
export function validateBatchStatus(
  batch: Batch,
  allowedStatuses: BatchStatus[]
): void {
  if (!allowedStatuses.includes(batch.status)) {
    throw createError.badRequest(ERROR_MESSAGES.BATCH_NOT_READY);
  }
}

/**
 * Validate that a batch exists
 * @param batch - The batch to validate (can be null/undefined)
 * @returns The validated batch
 * @throws AppError(404) if batch is null or undefined
 */
export function validateBatchExists(batch: Batch | null | undefined): Batch {
  if (!batch) {
    throw createError.notFound(ERROR_MESSAGES.BATCH_NOT_FOUND);
  }
  return batch;
}

/**
 * Validate file size is within limits
 * @param fileSize - File size in bytes
 * @param maxSize - Maximum allowed size in bytes (default: 20MB)
 * @throws AppError(400) if file size exceeds limit
 */
export function validateFileSize(
  fileSize: number,
  maxSize: number = 20 * 1024 * 1024
): void {
  if (fileSize > maxSize) {
    throw createError.badRequest(ERROR_MESSAGES.IMAGE_TOO_LARGE);
  }
}

/**
 * Validate batch image count is within limits
 * @param count - Number of images in batch
 * @param maxCount - Maximum allowed images (default: 100)
 * @throws AppError(400) if count exceeds limit
 */
export function validateBatchImageCount(count: number, maxCount: number = 100): void {
  if (count > maxCount) {
    throw createError.badRequest(ERROR_MESSAGES.BATCH_LIMIT_EXCEEDED);
  }
}

/**
 * Validate user has not exceeded lifetime photo generation limit
 * @param user - The user object to check
 * @throws AppError(403) if user has exceeded limit
 */
export function validateAccountPhotoLimit(user: User): void {
  if (user.totalPhotosGenerated >= user.photoGenerationLimit) {
    throw createError.forbidden(
      `${ERROR_MESSAGES.ACCOUNT_LIMIT_EXCEEDED}. You have generated ${user.totalPhotosGenerated} out of ${user.photoGenerationLimit} allowed photos.`
    );
  }
}

/**
 * Validate that generating N more photos won't exceed account limit
 * @param user - The user object to check
 * @param additionalPhotos - Number of photos to generate
 * @throws AppError(403) if generating would exceed limit
 */
export function validateAccountPhotoCapacity(user: User, additionalPhotos: number): void {
  const projectedTotal = user.totalPhotosGenerated + additionalPhotos;
  if (projectedTotal > user.photoGenerationLimit) {
    const remaining = user.photoGenerationLimit - user.totalPhotosGenerated;
    throw createError.forbidden(
      `Cannot generate ${additionalPhotos} photos. You have ${remaining} photos remaining out of your ${user.photoGenerationLimit} lifetime limit.`
    );
  }
}
