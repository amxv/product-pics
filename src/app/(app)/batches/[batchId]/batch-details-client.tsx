'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BatchStats } from '@/components/batch/batch-stats';
import { UploadZone } from '@/components/batch/upload-zone';
import { ImageGrid } from '@/components/batch/image-grid';
import { StartGenerationButton } from '@/components/batch/start-generation-button';
import { GenerationProgress } from '@/components/batch/generation-progress';
import { GenerationStatus } from '@/components/batch/generation-status';
import { ImageComparison } from '@/components/batch/image-comparison';
import { RetryFailedButton } from '@/components/batch/retry-failed-button';
import { updateBatchStatus, deleteBatch } from '@/actions/batch';
import { ArrowLeft, Trash2, Check } from 'lucide-react';
import type { Batch, UploadedImage, GeneratedImage, BatchProgress } from '@/lib/types';

interface BatchDetailsClientProps {
  batch: Batch;
  uploadedImages: UploadedImage[];
  generatedImages: GeneratedImage[];
}

export function BatchDetailsClient({ batch, uploadedImages, generatedImages }: BatchDetailsClientProps) {
  const router = useRouter();
  const [isMarkingReady, setIsMarkingReady] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleMarkReady = async () => {
    if (uploadedImages.length === 0) {
      alert('Please upload at least one image before marking as ready.');
      return;
    }

    setIsMarkingReady(true);

    try {
      const result = await updateBatchStatus(batch.id, 'uploaded');

      if (result.success) {
        router.refresh();
      } else {
        alert(result.error || 'Failed to mark batch as ready');
      }
    } catch {
      alert('Failed to mark batch as ready');
    } finally {
      setIsMarkingReady(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this batch? This action cannot be undone.')) {
      return;
    }

    setIsDeleting(true);

    try {
      const result = await deleteBatch(batch.id);

      if (result.success) {
        router.push('/batches');
      } else {
        alert(result.error || 'Failed to delete batch');
        setIsDeleting(false);
      }
    } catch {
      alert('Failed to delete batch');
      setIsDeleting(false);
    }
  };

  const getImageUrl = async (r2Key: string): Promise<string> => {
    const response = await fetch('/api/images/view-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ r2Key }),
    });

    if (!response.ok) {
      throw new Error('Failed to get image URL');
    }

    const data = await response.json();
    return data.url;
  };

  const getDemographicLabel = (demographic: string): string => {
    return demographic.charAt(0).toUpperCase() + demographic.slice(1);
  };

  const ageLabel = batch.ageRange.includes('-')
    ? `${batch.ageRange.split('-')[0]}-${batch.ageRange.split('-')[1]} years`
    : `${batch.ageRange} years`;

  // Calculate progress for progress component
  const initialProgress: BatchProgress = {
    batchId: batch.id,
    status: batch.status,
    totalImages: batch.totalImages,
    completedImages: batch.completedImages,
    failedImages: batch.failedImages,
    processingImages: generatedImages.filter(img => img.status === 'processing').length,
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <Link href="/batches">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Batches
          </Button>
        </Link>
      </div>

      {/* Batch info card */}
      <Card className="p-6 mb-8">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-gray-900">
              {getDemographicLabel(batch.demographic)}, {ageLabel}
            </h1>
            <div className="flex items-center gap-2">
              <GenerationStatus batch={batch} />
            </div>
          </div>

          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {isDeleting ? 'Deleting...' : 'Delete Batch'}
          </Button>
        </div>
      </Card>

      {/* Batch stats */}
      <div className="mb-8">
        <BatchStats batch={batch} />
      </div>

      {/* Upload zone (only show if status is uploading) */}
      {batch.status === 'uploading' && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Upload Images
          </h2>
          <UploadZone
            batchId={batch.id}
            onUploadComplete={() => router.refresh()}
          />

          {uploadedImages.length > 0 && (
            <div className="mt-6">
              <Button
                onClick={handleMarkReady}
                disabled={isMarkingReady}
                className="w-full sm:w-auto"
              >
                <Check className="h-4 w-4 mr-2" />
                {isMarkingReady
                  ? 'Marking as Ready...'
                  : 'Mark as Ready to Generate'}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Status-based UI */}
      {batch.status === 'uploaded' && (
        <div className="mb-8">
          <Card className="p-6 bg-blue-50 border-blue-200">
            <h3 className="text-lg font-semibold text-blue-900 mb-2">
              Ready to Generate
            </h3>
            <p className="text-sm text-blue-700 mb-4">
              Your images are uploaded and ready. Click the button below to start AI generation.
            </p>
            <StartGenerationButton batchId={batch.id} />
          </Card>
        </div>
      )}

      {batch.status === 'processing' && (
        <div className="mb-8">
          <GenerationProgress batchId={batch.id} initialProgress={initialProgress} />

          <div className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Image Comparisons
            </h2>
            <div className="space-y-4">
              {uploadedImages.map((uploadedImage) => {
                const generatedImage = generatedImages.find(
                  (gen) => gen.uploadedImageId === uploadedImage.id
                );
                return (
                  <ImageComparison
                    key={uploadedImage.id}
                    uploadedImage={uploadedImage}
                    generatedImage={generatedImage || null}
                    getImageUrl={getImageUrl}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      {batch.status === 'completed' && (
        <div className="mb-8">
          <Card className="p-6 bg-green-50 border-green-200">
            <h3 className="text-lg font-semibold text-green-900 mb-2">
              Generation Complete!
            </h3>
            <p className="text-sm text-green-700 mb-4">
              All {batch.completedImages} images have been generated successfully.
            </p>
          </Card>

          <div className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Generated Images
            </h2>
            <div className="space-y-4">
              {uploadedImages.map((uploadedImage) => {
                const generatedImage = generatedImages.find(
                  (gen) => gen.uploadedImageId === uploadedImage.id
                );
                return (
                  <ImageComparison
                    key={uploadedImage.id}
                    uploadedImage={uploadedImage}
                    generatedImage={generatedImage || null}
                    getImageUrl={getImageUrl}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      {batch.status === 'partial' && (
        <div className="mb-8">
          <Card className="p-6 bg-orange-50 border-orange-200">
            <h3 className="text-lg font-semibold text-orange-900 mb-2">
              Generation Partially Complete
            </h3>
            <p className="text-sm text-orange-700 mb-4">
              {batch.completedImages} image{batch.completedImages !== 1 ? 's' : ''} generated successfully,
              but {batch.failedImages} image{batch.failedImages !== 1 ? 's' : ''} failed.
            </p>
            <RetryFailedButton batchId={batch.id} failedCount={batch.failedImages} />
          </Card>

          <div className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Image Results
            </h2>
            <div className="space-y-4">
              {uploadedImages.map((uploadedImage) => {
                const generatedImage = generatedImages.find(
                  (gen) => gen.uploadedImageId === uploadedImage.id
                );
                return (
                  <ImageComparison
                    key={uploadedImage.id}
                    uploadedImage={uploadedImage}
                    generatedImage={generatedImage || null}
                    getImageUrl={getImageUrl}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      {batch.status === 'failed' && (
        <div className="mb-8">
          <Card className="p-6 bg-red-50 border-red-200">
            <h3 className="text-lg font-semibold text-red-900 mb-2">
              Generation Failed
            </h3>
            <p className="text-sm text-red-700 mb-4">
              All images failed to generate. Please try again.
            </p>
            <RetryFailedButton batchId={batch.id} failedCount={batch.failedImages} />
          </Card>
        </div>
      )}

      {/* Uploaded images (only show if status is uploading) */}
      {batch.status === 'uploading' && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Uploaded Images ({uploadedImages.length})
          </h2>
          <ImageGrid images={uploadedImages} getImageUrl={getImageUrl} />
        </div>
      )}
    </div>
  );
}
