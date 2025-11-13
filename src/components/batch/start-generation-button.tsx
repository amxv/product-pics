'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, Play } from 'lucide-react';

interface StartGenerationButtonProps {
  batchId: string;
  disabled?: boolean;
}

export function StartGenerationButton({ batchId, disabled }: StartGenerationButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleStartGeneration = async () => {
    setIsLoading(true);

    try {
      const response = await fetch('/api/generate/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ batchId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start generation');
      }

      // Success - refresh page to show progress UI
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start generation';
      alert(`Error: ${message}`);
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleStartGeneration}
      disabled={disabled || isLoading}
      size="lg"
      className="w-full sm:w-auto"
    >
      {isLoading ? (
        <>
          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
          Starting Generation...
        </>
      ) : (
        <>
          <Play className="h-5 w-5 mr-2" />
          Start Generation
        </>
      )}
    </Button>
  );
}
