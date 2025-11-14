import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db, userTable } from '../../../../../db';
import { eq } from 'drizzle-orm';

/**
 * GET /api/user/quota
 * Get current user's photo generation quota and usage
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [user] = await db
      .select({
        totalPhotosGenerated: userTable.totalPhotosGenerated,
        photoGenerationLimit: userTable.photoGenerationLimit,
      })
      .from(userTable)
      .where(eq(userTable.id, session.user.id))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const remaining = user.photoGenerationLimit - user.totalPhotosGenerated;
    const usagePercentage = Math.round(
      (user.totalPhotosGenerated / user.photoGenerationLimit) * 100
    );

    return NextResponse.json({
      totalGenerated: user.totalPhotosGenerated,
      limit: user.photoGenerationLimit,
      remaining,
      usagePercentage,
    });
  } catch (error) {
    console.error('Error fetching user quota:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
