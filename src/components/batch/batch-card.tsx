import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import type { Batch } from '@/lib/types';

interface BatchCardProps {
  batch: Batch;
}

function getStatusColor(status: string): 'default' | 'secondary' | 'destructive' {
  switch (status) {
    case 'uploading':
      return 'secondary';
    case 'uploaded':
      return 'default';
    case 'processing':
      return 'default';
    case 'completed':
      return 'default';
    case 'partial':
      return 'secondary';
    case 'failed':
      return 'destructive';
    default:
      return 'secondary';
  }
}

function getDemographicLabel(demographic: string): string {
  return demographic.charAt(0).toUpperCase() + demographic.slice(1);
}

export function BatchCard({ batch }: BatchCardProps) {
  const { id, demographic, ageRange, status, totalImages, completedImages, failedImages, createdAt } = batch;

  // Format age range for display
  const ageLabel = ageRange.includes('-')
    ? `${ageRange.split('-')[0]}-${ageRange.split('-')[1]} years`
    : `${ageRange} years`;

  // Format creation date
  const timeAgo = formatDistanceToNow(new Date(createdAt), { addSuffix: true });

  // Calculate image counts display
  let imageCountText = '';
  if (status === 'uploading' || status === 'uploaded') {
    imageCountText = `${totalImages} uploaded`;
  } else if (status === 'processing') {
    imageCountText = `${completedImages}/${totalImages} processed`;
  } else if (status === 'completed') {
    imageCountText = `${completedImages} completed`;
  } else if (status === 'partial') {
    imageCountText = `${completedImages} completed, ${failedImages} failed`;
  } else if (status === 'failed') {
    imageCountText = `${failedImages} failed`;
  }

  return (
    <Link href={`/batches/${id}`}>
      <Card className="p-6 cursor-pointer">
        <div className="space-y-3">
          {/* Demographic and age */}
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              {getDemographicLabel(demographic)}, {ageLabel}
            </h3>
          </div>

          {/* Status badge */}
          <div>
            <Badge variant={getStatusColor(status)} className="capitalize">
              {status}
            </Badge>
          </div>

          {/* Image counts */}
          {imageCountText && (
            <p className="text-sm text-muted-foreground">{imageCountText}</p>
          )}

          {/* Created date */}
          <p className="text-xs text-muted-foreground">{timeAgo}</p>
        </div>
      </Card>
    </Link>
  );
}
