'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import type { BatchProgress } from '@/lib/types';

interface GenerationProgressProps {
  batchId: string;
  initialProgress: BatchProgress;
}

export function GenerationProgress({ batchId, initialProgress }: GenerationProgressProps) {
  const [progress, setProgress] = useState<BatchProgress>(initialProgress);
  const [startTime] = useState(() => Date.now());
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    // Update elapsed time every second
    const elapsedInterval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    // Stop polling if status is final
    if (
      progress.status === 'completed' ||
      progress.status === 'partial' ||
      progress.status === 'failed'
    ) {
      clearInterval(elapsedInterval);
      return;
    }

    // Poll for progress every 3 seconds
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/generate/poll/${batchId}`);
        if (response.ok) {
          const data: BatchProgress = await response.json();
          setProgress(data);

          // Stop polling if done
          if (
            data.status === 'completed' ||
            data.status === 'partial' ||
            data.status === 'failed'
          ) {
            clearInterval(pollInterval);
            clearInterval(elapsedInterval);

            // Refresh page after a short delay to show final results
            setTimeout(() => {
              window.location.reload();
            }, 1000);
          }
        }
      } catch (error) {
        console.error('Failed to poll progress:', error);
      }
    }, 3000);

    return () => {
      clearInterval(pollInterval);
      clearInterval(elapsedInterval);
    };
  }, [batchId, progress.status, startTime]);

  const progressPercentage = progress.totalImages > 0
    ? Math.round(((progress.completedImages + progress.failedImages) / progress.totalImages) * 100)
    : 0;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Estimate remaining time based on completed images
  const estimateRemainingTime = () => {
    if (progress.completedImages === 0 || elapsedTime === 0) {
      return null;
    }

    const avgTimePerImage = elapsedTime / progress.completedImages;
    const remainingImages = progress.totalImages - progress.completedImages - progress.failedImages;
    const estimatedSeconds = Math.round(avgTimePerImage * remainingImages);

    return formatTime(estimatedSeconds);
  };

  const statusMessage = () => {
    if (progress.status === 'completed') {
      return 'All images generated successfully!';
    }
    if (progress.status === 'partial') {
      return `Generation complete. ${progress.failedImages} image${progress.failedImages !== 1 ? 's' : ''} failed.`;
    }
    if (progress.status === 'failed') {
      return 'Generation failed. Please try again.';
    }
    return `Processing ${progress.completedImages + progress.failedImages}/${progress.totalImages} images...`;
  };

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Generation Progress</h3>
          {progress.status === 'processing' && (
            <Loader2 className="h-5 w-5 animate-spin text-yellow-500" />
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>{statusMessage()}</span>
            <span>{progressPercentage}%</span>
          </div>
          <Progress value={progressPercentage} className="h-3" />
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="default" className="bg-green-500 text-white">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            {progress.completedImages} Completed
          </Badge>
          {progress.failedImages > 0 && (
            <Badge variant="destructive">
              <XCircle className="h-3 w-3 mr-1" />
              {progress.failedImages} Failed
            </Badge>
          )}
          {progress.processingImages > 0 && (
            <Badge variant="default" className="bg-yellow-500 text-white">
              <Clock className="h-3 w-3 mr-1" />
              {progress.processingImages} Processing
            </Badge>
          )}
        </div>

        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Elapsed: {formatTime(elapsedTime)}</span>
          {estimateRemainingTime() && (
            <span>Est. remaining: {estimateRemainingTime()}</span>
          )}
        </div>
      </div>
    </Card>
  );
}
