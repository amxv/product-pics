'use client';

/**
 * Download Button Component
 * Triggers batch download with loading states and error handling
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface DownloadButtonProps {
  batchId: string;
  imageCount: number;
  disabled?: boolean;
}

export function DownloadButton({
  batchId,
  imageCount,
  disabled = false,
}: DownloadButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const handleDownload = async () => {
    try {
      setIsDownloading(true);

      // Create download URL
      const downloadUrl = `/api/download/${batchId}`;

      // Trigger download by creating a hidden link
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();

      // Clean up
      setTimeout(() => {
        document.body.removeChild(link);
        setIsDownloading(false);
      }, 1000);

      // Show success toast
      toast.success('Download started!', {
        description: `Downloading ${imageCount} image${imageCount !== 1 ? 's' : ''}...`,
      });

      // Reset retry count on success
      setRetryCount(0);
    } catch (_error) {
      setIsDownloading(false);

      // Handle errors with retry logic
      const newRetryCount = retryCount + 1;
      setRetryCount(newRetryCount);

      if (newRetryCount < 3) {
        // Allow retry
        toast.error('Download failed', {
          description: `Failed to start download. Click the button to try again. (Attempt ${newRetryCount}/3)`,
        });
      } else {
        // Max retries reached
        toast.error('Download failed', {
          description:
            'Failed to start download after multiple attempts. Please refresh the page and try again.',
        });
      }
    }
  };

  return (
    <Button
      onClick={handleDownload}
      disabled={disabled || isDownloading}
      size="lg"
      className="w-full sm:w-auto"
    >
      {isDownloading ? (
        <>
          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
          Preparing Download...
        </>
      ) : (
        <>
          <Download className="h-5 w-5 mr-2" />
          Download Results ({imageCount} image{imageCount !== 1 ? 's' : ''})
        </>
      )}
    </Button>
  );
}
