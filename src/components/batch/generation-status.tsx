import { Badge } from '@/components/ui/badge';
import {
  Upload,
  CheckCircle2,
  Loader2,
  AlertCircle,
  XCircle,
  Clock
} from 'lucide-react';
import type { Batch } from '@/lib/types';

interface GenerationStatusProps {
  batch: Batch;
}

export function GenerationStatus({ batch }: GenerationStatusProps) {
  const statusConfig = {
    uploading: {
      label: 'Uploading',
      variant: 'default' as const,
      icon: Upload,
      className: 'bg-blue-500',
    },
    uploaded: {
      label: 'Ready',
      variant: 'secondary' as const,
      icon: Clock,
      className: 'bg-gray-500',
    },
    processing: {
      label: 'Processing',
      variant: 'default' as const,
      icon: Loader2,
      className: 'bg-yellow-500',
    },
    completed: {
      label: 'Completed',
      variant: 'default' as const,
      icon: CheckCircle2,
      className: 'bg-green-500',
    },
    partial: {
      label: 'Partial',
      variant: 'default' as const,
      icon: AlertCircle,
      className: 'bg-orange-500',
    },
    failed: {
      label: 'Failed',
      variant: 'destructive' as const,
      icon: XCircle,
      className: 'bg-red-500',
    },
  };

  const config = statusConfig[batch.status];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={`${config.className} text-white`}>
      <Icon className="h-3 w-3 mr-1" />
      {config.label}
    </Badge>
  );
}
