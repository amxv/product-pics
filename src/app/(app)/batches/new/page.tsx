'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BatchForm } from '@/components/batch/batch-form';
import { ArrowLeft } from 'lucide-react';

export default function NewBatchPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <Link href="/batches">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Batches
          </Button>
        </Link>
      </div>

      <Card className="p-6">
        <h1 className="text-2xl font-bold text-foreground mb-6">
          Create New Batch
        </h1>
        <BatchForm />
      </Card>
    </div>
  );
}
