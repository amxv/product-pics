import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { nanoid } from 'nanoid';
import { auth } from '@/lib/auth';
import { db, batchTable } from '../../../../db';
import { createBatchSchema, type CreateBatchResponse } from '@/lib/types';

/**
 * POST /api/batches
 * Create a new batch
 */
export async function POST(request: NextRequest) {
  try {
    // Validate session
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validation = createBatchSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { demographic, ageRange } = validation.data;

    // Create batch record
    const batchId = nanoid();
    await db.insert(batchTable).values({
      id: batchId,
      userId: session.user.id,
      demographic,
      ageRange,
      status: 'uploading',
      totalImages: 0,
      completedImages: 0,
      failedImages: 0,
    });

    // Return batch details
    const response: CreateBatchResponse = {
      batchId,
      demographic,
      ageRange,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('Error creating batch:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
