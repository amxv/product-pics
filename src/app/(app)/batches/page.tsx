import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { db, batchTable } from '../../../../db';
import { eq, desc } from 'drizzle-orm';
import { Button } from '@/components/ui/button';
import { BatchList } from '@/components/batch/batch-list';
import { Plus, Sparkles } from 'lucide-react';

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
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-12 gap-4">
        <div className="relative">
          <div className="absolute -left-4 -top-4 w-12 h-12 bg-yellow-300 rounded-full blur-xl opacity-50 animate-pulse"></div>
          <h1 className="relative text-4xl sm:text-5xl font-black text-foreground uppercase tracking-tighter drop-shadow-sm">
            My Batches
          </h1>
          <p className="text-muted-foreground font-medium mt-1 text-lg">Manage your AI photo generations</p>
        </div>

        <Link href="/batches/new">
          <Button size="lg" className="text-md font-bold bg-primary hover:bg-primary/90 text-white border-2 border-black shadow-hard hover:shadow-[6px_6px_0px_0px_#000] hover:-translate-y-1 hover:-translate-x-1 transition-all">
            <Plus className="h-5 w-5 mr-2 stroke-[3]" />
            Create New Batch
          </Button>
        </Link>
      </div>

      <div className="bg-white border-2 border-black shadow-hard p-1">
         <BatchList batches={batches} />
      </div>
    </div>
  );
}
