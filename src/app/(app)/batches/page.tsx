import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { db, batchTable } from '../../../../db';
import { eq, desc } from 'drizzle-orm';
import { Button } from '@/components/ui/button';
import { BatchList } from '@/components/batch/batch-list';
import { Plus } from 'lucide-react';

export default async function BatchesPage() {
  // Validate session
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect('/sign-in');
  }

  // Fetch all batches for current user
  const batches = await db
    .select()
    .from(batchTable)
    .where(eq(batchTable.userId, session.user.id))
    .orderBy(desc(batchTable.createdAt));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">My Batches</h1>
        <Link href="/batches/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Create New Batch
          </Button>
        </Link>
      </div>

      <BatchList batches={batches} />
    </div>
  );
}
