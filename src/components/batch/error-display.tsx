/**
 * Error Display Component
 * Shows a list of failed images with error messages and retry information
 */

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AlertTriangle, XCircle } from 'lucide-react';
import type { GeneratedImage, UploadedImage } from '@/lib/types';

interface ErrorDisplayProps {
  failedImages: GeneratedImage[];
  uploadedImages: UploadedImage[];
}

export function ErrorDisplay({ failedImages, uploadedImages }: ErrorDisplayProps) {
  if (failedImages.length === 0) {
    return null;
  }

  // Create a map for quick lookup of uploaded images
  const uploadedImageMap = new Map(
    uploadedImages.map((img) => [img.id, img])
  );

  return (
    <Alert variant="destructive" className="border-red-200 bg-red-50">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="text-red-900 font-semibold">
        Failed Images ({failedImages.length})
      </AlertTitle>
      <AlertDescription className="mt-4">
        <div className="rounded-md border border-red-200 bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-red-50 hover:bg-red-50">
                <TableHead className="font-semibold text-red-900">
                  Original Filename
                </TableHead>
                <TableHead className="font-semibold text-red-900">
                  Error Message
                </TableHead>
                <TableHead className="font-semibold text-red-900 text-center">
                  Retry Count
                </TableHead>
                <TableHead className="font-semibold text-red-900">
                  Timestamp
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {failedImages.map((generatedImage) => {
                const uploadedImage = uploadedImageMap.get(
                  generatedImage.uploadedImageId
                );
                const originalFilename =
                  uploadedImage?.originalFilename || 'Unknown';
                const errorMessage =
                  generatedImage.errorMessage || 'Unknown error occurred';
                const retryCount = generatedImage.retryCount || 0;
                const timestamp = new Date(
                  generatedImage.createdAt
                ).toLocaleString();

                return (
                  <TableRow key={generatedImage.id}>
                    <TableCell className="font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        <XCircle className="h-4 w-4 text-red-500" />
                        {originalFilename}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {errorMessage}
                    </TableCell>
                    <TableCell className="text-center text-sm text-gray-600">
                      {retryCount}/3
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {timestamp}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4 text-sm text-red-700">
          <p>
            The images above failed to generate after multiple retry attempts.
            Common causes include:
          </p>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>RunPod API timeout or rate limiting</li>
            <li>Safety checker flagged inappropriate content</li>
            <li>Image processing errors</li>
            <li>Network connectivity issues</li>
          </ul>
          <p className="mt-2">
            You can retry the failed images using the button above, or contact support
            if the issue persists.
          </p>
        </div>
      </AlertDescription>
    </Alert>
  );
}
