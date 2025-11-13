/**
 * Download API route
 * Generates and streams zip file containing all generated images for a batch
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { createBatchZip } from '@/lib/zip';
import { logDownloadEvent, logError } from '@/lib/logger';
import { AppError } from '@/lib/errors';
import { validateSession } from '@/lib/validation';

interface RouteContext {
  params: Promise<{
    batchId: string;
  }>;
}

/**
 * GET /api/download/[batchId]
 * Download batch results as zip file
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    // Validate session
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    const validatedSession = validateSession(session);

    // Get batchId from route params
    const { batchId } = await context.params;

    // Generate zip file
    const { stream, filename } = await createBatchZip(batchId, validatedSession.user.id);

    // Log download event
    logDownloadEvent(batchId, validatedSession.user.id, 0); // Image count will be calculated in createBatchZip

    // Convert archiver stream to Web ReadableStream for NextResponse
    const readableStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk: Buffer) => {
          controller.enqueue(chunk);
        });

        stream.on('end', () => {
          controller.close();
        });

        stream.on('error', (error) => {
          logError('Download Stream', error);
          controller.error(error);
        });
      },
    });

    // Return streaming response
    return new NextResponse(readableStream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    // Handle AppError instances
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    // Log unexpected errors
    logError('Download API', error as Error);

    // Return generic error
    return NextResponse.json(
      { error: 'Failed to generate download' },
      { status: 500 }
    );
  }
}
