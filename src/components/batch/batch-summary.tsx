/**
 * Batch Summary Component
 * Displays batch statistics including completion rate, success/failure counts
 */

import { Card } from '@/components/ui/card';
import { CheckCircle2, XCircle, Clock, TrendingUp } from 'lucide-react';
import type { Batch, GeneratedImage, UploadedImage } from '@/lib/types';

interface BatchSummaryProps {
  batch: Batch;
  generatedImages: GeneratedImage[];
  uploadedImages: UploadedImage[];
}

export function BatchSummary({ batch, generatedImages: _generatedImages, uploadedImages: _uploadedImages }: BatchSummaryProps) {
  // Calculate statistics
  const totalImages = batch.totalImages;
  const completedImages = batch.completedImages;
  const failedImages = batch.failedImages;
  const completionRate =
    totalImages > 0 ? Math.round((completedImages / totalImages) * 100) : 0;

  // Calculate generation time
  const generationTime = calculateGenerationTime(batch);

  // Format demographic and age
  const demographicLabel =
    batch.demographic.charAt(0).toUpperCase() + batch.demographic.slice(1);
  const ageLabel = batch.ageRange.includes('-')
    ? `${batch.ageRange.split('-')[0]}-${batch.ageRange.split('-')[1]} years`
    : `${batch.ageRange} years`;

  // Determine styling based on batch status
  const isPartial = batch.status === 'partial';
  const isFailed = batch.status === 'failed';
  const isCompleted = batch.status === 'completed';

  const cardClassName = isPartial
    ? 'border-orange-200 bg-orange-50'
    : isFailed
    ? 'border-red-200 bg-red-50'
    : isCompleted
    ? 'border-green-200 bg-green-50'
    : '';

  return (
    <Card className={`p-6 ${cardClassName}`}>
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            Batch Summary
          </h3>
          <p className="text-sm text-gray-600">
            {demographicLabel}, {ageLabel}
          </p>
        </div>

        {/* Statistics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Total Images */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <TrendingUp className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total</p>
              <p className="text-xl font-semibold text-gray-900">{totalImages}</p>
            </div>
          </div>

          {/* Successful */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Successful</p>
              <p className="text-xl font-semibold text-green-600">{completedImages}</p>
            </div>
          </div>

          {/* Failed */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-100">
              <XCircle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Failed</p>
              <p className="text-xl font-semibold text-red-600">{failedImages}</p>
            </div>
          </div>

          {/* Generation Time */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100">
              <Clock className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Time</p>
              <p className="text-xl font-semibold text-gray-900">{generationTime}</p>
            </div>
          </div>
        </div>

        {/* Completion Rate Progress Bar */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              Completion Rate
            </span>
            <span className="text-sm font-semibold text-gray-900">
              {completionRate}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all ${
                completionRate === 100
                  ? 'bg-green-500'
                  : completionRate >= 50
                  ? 'bg-orange-500'
                  : 'bg-red-500'
              }`}
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>

        {/* Status Message */}
        {isPartial && (
          <div className="pt-2 border-t border-orange-200">
            <p className="text-sm text-orange-700">
              Some images failed to generate. You can download the successful images
              or retry the failed ones.
            </p>
          </div>
        )}

        {isFailed && (
          <div className="pt-2 border-t border-red-200">
            <p className="text-sm text-red-700">
              All images failed to generate. Please review the errors below and try
              again.
            </p>
          </div>
        )}

        {isCompleted && (
          <div className="pt-2 border-t border-green-200">
            <p className="text-sm text-green-700">
              All images generated successfully! Download your results below.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

/**
 * Calculate human-readable generation time
 */
function calculateGenerationTime(batch: Batch): string {
  if (!batch.completedAt) {
    return 'N/A';
  }

  const startTime = new Date(batch.createdAt).getTime();
  const endTime = new Date(batch.completedAt).getTime();
  const durationMs = endTime - startTime;

  // Convert to minutes and seconds
  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.floor((durationMs % 60000) / 1000);

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}
