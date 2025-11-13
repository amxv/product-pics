'use client';

import { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload } from 'lucide-react';
import { UploadProgress } from './upload-progress';
import { uploadToR2, retryUpload } from '@/lib/upload';
import type { PresignedUrlResponse, SupportedFormat } from '@/lib/types';

interface FileUploadState {
  file: File;
  progress: number;
  status: 'uploading' | 'completed' | 'failed';
  errorMessage?: string;
}

interface UploadZoneProps {
  batchId: string;
  onUploadComplete: () => void;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export function UploadZone({ batchId, onUploadComplete }: UploadZoneProps) {
  const [files, setFiles] = useState<Map<string, FileUploadState>>(new Map());
  const [isUploading, setIsUploading] = useState(false);

  const onDrop = async (acceptedFiles: File[]) => {
    // Validate file count
    const currentCount = files.size;
    if (currentCount + acceptedFiles.length > 100) {
      alert(`Cannot upload more than 100 files. Current: ${currentCount}`);
      return;
    }

    // Initialize file states
    const newFiles = new Map(files);
    acceptedFiles.forEach((file) => {
      newFiles.set(file.name, {
        file,
        progress: 0,
        status: 'uploading',
      });
    });
    setFiles(newFiles);
    setIsUploading(true);

    // Upload files sequentially
    for (const file of acceptedFiles) {
      await uploadFile(file);
    }

    setIsUploading(false);
    onUploadComplete();
  };

  const uploadFile = async (file: File) => {
    try {
      // Request presigned URL
      const presignedResponse = await fetch('/api/upload/presigned-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId,
          fileName: file.name,
          fileType: file.type as SupportedFormat,
          fileSize: file.size,
        }),
      });

      if (!presignedResponse.ok) {
        throw new Error('Failed to get presigned URL');
      }

      const presignedData: PresignedUrlResponse = await presignedResponse.json();

      // Upload to R2 with retry logic
      await retryUpload(async () => {
        await uploadToR2(presignedData.presignedUrl, file, (progress) => {
          setFiles((prev) => {
            const updated = new Map(prev);
            const fileState = updated.get(file.name);
            if (fileState) {
              updated.set(file.name, { ...fileState, progress });
            }
            return updated;
          });
        });
      });

      // Mark upload as complete
      await fetch('/api/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadedImageId: presignedData.uploadedImageId,
          success: true,
        }),
      });

      // Update status to completed
      setFiles((prev) => {
        const updated = new Map(prev);
        const fileState = updated.get(file.name);
        if (fileState) {
          updated.set(file.name, {
            ...fileState,
            progress: 100,
            status: 'completed',
          });
        }
        return updated;
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Upload failed';

      // Update status to failed
      setFiles((prev) => {
        const updated = new Map(prev);
        const fileState = updated.get(file.name);
        if (fileState) {
          updated.set(file.name, {
            ...fileState,
            status: 'failed',
            errorMessage,
          });
        }
        return updated;
      });

      console.error(`Failed to upload ${file.name}:`, error);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'image/heic': ['.heic'],
    },
    maxSize: MAX_FILE_SIZE,
    disabled: isUploading,
  });

  const completedCount = Array.from(files.values()).filter(
    (f) => f.status === 'completed'
  ).length;
  const totalCount = files.size;

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
          transition-colors
          ${
            isDragActive
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 hover:border-gray-400'
          }
          ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input {...getInputProps()} />
        <Upload className="mx-auto h-12 w-12 text-gray-400" />
        <p className="mt-2 text-sm font-medium text-gray-900">
          {isDragActive
            ? 'Drop images here'
            : 'Drag images here or click to browse'}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          JPG, PNG, WebP, HEIC - Max 20MB per file, 100 files max
        </p>
      </div>

      {totalCount > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">
            Upload Progress: {completedCount}/{totalCount} files uploaded
          </p>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {Array.from(files.entries()).map(([fileName, fileState]) => (
              <UploadProgress
                key={fileName}
                fileName={fileName}
                progress={fileState.progress}
                status={fileState.status}
                errorMessage={fileState.errorMessage}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
