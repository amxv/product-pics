import { redirect, notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db, batchTable, uploadedImageTable } from '../../../../../db';
import { eq } from 'drizzle-orm';
import { BatchDetailsClient } from './batch-details-client';

interface BatchDetailsPageProps {
  params: Promise<{
    batchId: string;
  }>;
}

export default async function BatchDetailsPage({ params }: BatchDetailsPageProps) {
  // Validate session
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect('/sign-in');
  }

  // Resolve params
  const { batchId } = await params;

  // Fetch batch
  const [batch] = await db
    .select()
    .from(batchTable)
    .where(eq(batchTable.id, batchId))
    .limit(1);

  if (!batch) {
    notFound();
  }

  // Verify user owns batch
  if (batch.userId !== session.user.id) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-800">
            You do not have permission to view this batch.
          </p>
        </div>
      </div>
    );
  }

  // Fetch all uploaded images for this batch
  const uploadedImages = await db
    .select()
    .from(uploadedImageTable)
    .where(eq(uploadedImageTable.batchId, batchId));

  return (
    <BatchDetailsClient
      batch={batch}
      uploadedImages={uploadedImages}
    />
  );
}
