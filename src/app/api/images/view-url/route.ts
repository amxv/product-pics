import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { auth } from '@/lib/auth';
import { r2Client, R2_BUCKET_NAME } from '@/lib/r2';
import { z } from 'zod';

const viewUrlSchema = z.object({
  r2Key: z.string().min(1),
});

/**
 * POST /api/images/view-url
 * Generate presigned GET URL for viewing an image
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
    const validation = viewUrlSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { r2Key } = validation.data;

    // Verify the key belongs to the current user
    if (!r2Key.startsWith(`uploads/${session.user.id}/`) &&
        !r2Key.startsWith(`generated/${session.user.id}/`)) {
      return NextResponse.json(
        { error: 'You do not have permission to access this image' },
        { status: 403 }
      );
    }

    // Generate presigned GET URL (15-minute expiry)
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: r2Key,
    });

    const presignedUrl = await getSignedUrl(r2Client, command, {
      expiresIn: 900, // 15 minutes
    });

    return NextResponse.json({ url: presignedUrl }, { status: 200 });
  } catch (error) {
    console.error('Error generating view URL:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
