'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BatchCard } from './batch-card';
import type { Batch } from '@/lib/types';

interface BatchListProps {
  batches: Batch[];
}

export function BatchList({ batches }: BatchListProps) {
  const [selectedTab, setSelectedTab] = useState('all');

  // Filter batches by status
  const filterBatches = (status?: string) => {
    if (!status || status === 'all') {
      return batches;
    }
    return batches.filter((batch) => batch.status === status);
  };

  const allBatches = batches;
  const uploadingBatches = filterBatches('uploading');
  const processingBatches = filterBatches('processing');
  const completedBatches = batches.filter(
    (batch) =>
      batch.status === 'completed' ||
      batch.status === 'partial' ||
      batch.status === 'failed'
  );

  // Sort batches by createdAt DESC (newest first)
  const sortedBatches = (batchList: Batch[]) => {
    return [...batchList].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  };

  if (batches.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
          <svg
            className="w-8 h-8 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-foreground mb-2">No batches yet</h3>
        <p className="text-sm text-muted-foreground">
          Create your first batch to get started.
        </p>
      </div>
    );
  }

  return (
    <Tabs value={selectedTab} onValueChange={setSelectedTab}>
      <TabsList className="mb-6">
        <TabsTrigger value="all">
          All ({allBatches.length})
        </TabsTrigger>
        <TabsTrigger value="uploading">
          Uploading ({uploadingBatches.length})
        </TabsTrigger>
        <TabsTrigger value="processing">
          Processing ({processingBatches.length})
        </TabsTrigger>
        <TabsTrigger value="completed">
          Completed ({completedBatches.length})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="all">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {sortedBatches(allBatches).map((batch) => (
            <BatchCard key={batch.id} batch={batch} />
          ))}
        </div>
      </TabsContent>

      <TabsContent value="uploading">
        {uploadingBatches.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {sortedBatches(uploadingBatches).map((batch) => (
              <BatchCard key={batch.id} batch={batch} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            No batches currently uploading
          </div>
        )}
      </TabsContent>

      <TabsContent value="processing">
        {processingBatches.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {sortedBatches(processingBatches).map((batch) => (
              <BatchCard key={batch.id} batch={batch} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            No batches currently processing
          </div>
        )}
      </TabsContent>

      <TabsContent value="completed">
        {completedBatches.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {sortedBatches(completedBatches).map((batch) => (
              <BatchCard key={batch.id} batch={batch} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            No completed batches yet
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
