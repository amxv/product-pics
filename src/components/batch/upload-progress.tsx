import { Progress } from '@/components/ui/progress';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface UploadProgressProps {
  fileName: string;
  progress: number; // 0-100
  status: 'uploading' | 'completed' | 'failed';
  errorMessage?: string;
}

export function UploadProgress({
  fileName,
  progress,
  status,
  errorMessage,
}: UploadProgressProps) {
  // Truncate file name if too long
  const truncatedFileName =
    fileName.length > 50 ? `${fileName.slice(0, 47)}...` : fileName;

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-gray-900 truncate flex-1">
          {truncatedFileName}
        </p>
        <div className="ml-3">
          {status === 'uploading' && (
            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
          )}
          {status === 'completed' && (
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          )}
          {status === 'failed' && <XCircle className="h-5 w-5 text-red-500" />}
        </div>
      </div>

      <Progress value={progress} className="h-2" />

      {status === 'uploading' && (
        <p className="text-xs text-gray-500 mt-1">{progress}%</p>
      )}

      {status === 'failed' && errorMessage && (
        <p className="text-xs text-red-600 mt-2">{errorMessage}</p>
      )}
    </div>
  );
}
