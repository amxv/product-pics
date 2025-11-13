'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, RotateCcw } from 'lucide-react';

interface RetryFailedButtonProps {
  batchId: string;
  failedCount: number;
}

export function RetryFailedButton({ batchId, failedCount }: RetryFailedButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  if (failedCount === 0) {
    return null;
  }

  const handleRetry = async () => {
    const confirmed = confirm(
      `Retry ${failedCount} failed image${failedCount !== 1 ? 's' : ''}? This will resubmit all failed images for generation.`
    );

    if (!confirmed) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/generate/retry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ batchId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to retry');
      }

      // Success - refresh page
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to retry';
      alert(`Error: ${message}`);
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleRetry}
      disabled={isLoading}
      variant="secondary"
      size="lg"
      className="w-full sm:w-auto"
    >
      {isLoading ? (
        <>
          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
          Retrying...
        </>
      ) : (
        <>
          <RotateCcw className="h-5 w-5 mr-2" />
          Retry {failedCount} Failed Image{failedCount !== 1 ? 's' : ''}
        </>
      )}
    </Button>
  );
}
