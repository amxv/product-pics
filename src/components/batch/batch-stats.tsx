import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { Batch } from '@/lib/types';

interface BatchStatsProps {
  batch: Batch;
}

export function BatchStats({ batch }: BatchStatsProps) {
  const { totalImages, completedImages, failedImages } = batch;
  const processingImages = totalImages - completedImages - failedImages;
  const completionPercentage =
    totalImages > 0 ? Math.round((completedImages / totalImages) * 100) : 0;

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Batch Statistics
      </h3>

      <div className="space-y-4">
        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              Overall Progress
            </span>
            <span className="text-sm font-medium text-gray-900">
              {completionPercentage}%
            </span>
          </div>
          <Progress value={completionPercentage} className="h-2" />
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-4 pt-4 border-t">
          <div>
            <p className="text-sm text-gray-500">Total Images</p>
            <p className="text-2xl font-bold text-gray-900">{totalImages}</p>
          </div>

          <div>
            <p className="text-sm text-gray-500">Completed</p>
            <p className="text-2xl font-bold text-green-600">
              {completedImages}
            </p>
          </div>

          {processingImages > 0 && (
            <div>
              <p className="text-sm text-gray-500">Processing</p>
              <p className="text-2xl font-bold text-yellow-600">
                {processingImages}
              </p>
            </div>
          )}

          {failedImages > 0 && (
            <div>
              <p className="text-sm text-gray-500">Failed</p>
              <p className="text-2xl font-bold text-red-600">{failedImages}</p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
