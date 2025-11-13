/**
 * Centralized error logging utility
 * Logs errors to console with structured formatting
 * Can be extended to integrate with external services like Sentry
 */

interface LogErrorMetadata {
  [key: string]: unknown;
}

/**
 * Log an error with context and optional metadata
 * @param context - Description of where/when the error occurred
 * @param error - The error object
 * @param metadata - Additional data to log (optional)
 */
export function logError(
  context: string,
  error: Error | unknown,
  metadata?: LogErrorMetadata
): void {
  const timestamp = new Date().toISOString();
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  // Structured log output
  console.error({
    timestamp,
    context,
    message: errorMessage,
    stack: errorStack,
    metadata,
  });

  // Alternative: Simple string format for readability
  console.error(`[${timestamp}] ERROR in ${context}: ${errorMessage}`);
  if (metadata && Object.keys(metadata).length > 0) {
    console.error('Metadata:', JSON.stringify(metadata, null, 2));
  }

  // TODO: Integrate with Sentry or other error tracking service
  // Example (commented out):
  // if (process.env.SENTRY_DSN) {
  //   Sentry.captureException(error, {
  //     tags: { context },
  //     extra: metadata,
  //   });
  // }
}

/**
 * Log an info message with context
 * @param context - Description of the event
 * @param message - The info message
 * @param metadata - Additional data to log (optional)
 */
export function logInfo(
  context: string,
  message: string,
  metadata?: LogErrorMetadata
): void {
  const timestamp = new Date().toISOString();

  console.log({
    timestamp,
    context,
    message,
    metadata,
  });

  console.log(`[${timestamp}] INFO in ${context}: ${message}`);
  if (metadata && Object.keys(metadata).length > 0) {
    console.log('Metadata:', JSON.stringify(metadata, null, 2));
  }
}

/**
 * Log a warning with context
 * @param context - Description of the event
 * @param message - The warning message
 * @param metadata - Additional data to log (optional)
 */
export function logWarning(
  context: string,
  message: string,
  metadata?: LogErrorMetadata
): void {
  const timestamp = new Date().toISOString();

  console.warn({
    timestamp,
    context,
    message,
    metadata,
  });

  console.warn(`[${timestamp}] WARNING in ${context}: ${message}`);
  if (metadata && Object.keys(metadata).length > 0) {
    console.warn('Metadata:', JSON.stringify(metadata, null, 2));
  }
}
