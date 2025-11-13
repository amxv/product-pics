'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2, Image as ImageIcon } from 'lucide-react';
import type { UploadedImage } from '@/lib/types';

interface ImageGridProps {
  images: UploadedImage[];
  onDelete?: (imageId: string) => void;
  getImageUrl: (r2Key: string) => Promise<string>;
}

export function ImageGrid({ images, onDelete, getImageUrl }: ImageGridProps) {
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
  const [loadingImages, setLoadingImages] = useState<Set<string>>(new Set());
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  // Load image URL on mount or when needed
  const loadImageUrl = async (imageId: string, r2Key: string) => {
    if (imageUrls.has(imageId) || loadingImages.has(imageId)) {
      return;
    }

    setLoadingImages((prev) => new Set(prev).add(imageId));

    try {
      const url = await getImageUrl(r2Key);
      setImageUrls((prev) => new Map(prev).set(imageId, url));
    } catch (error) {
      console.error(`Failed to load image ${imageId}:`, error);
      setFailedImages((prev) => new Set(prev).add(imageId));
    } finally {
      setLoadingImages((prev) => {
        const next = new Set(prev);
        next.delete(imageId);
        return next;
      });
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const handleDelete = (imageId: string, fileName: string) => {
    if (
      onDelete &&
      confirm(`Are you sure you want to delete "${fileName}"?`)
    ) {
      onDelete(imageId);
    }
  };

  if (images.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <ImageIcon className="mx-auto h-12 w-12 text-gray-400" />
        <p className="mt-2">No images uploaded yet</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
      {images.map((image) => {
        const isLoading = loadingImages.has(image.id);
        const hasFailed = failedImages.has(image.id);
        const imageUrl = imageUrls.get(image.id);

        // Load image URL if not already loaded
        if (!imageUrl && !isLoading && !hasFailed) {
          loadImageUrl(image.id, image.r2Key);
        }

        return (
          <Card key={image.id} className="overflow-hidden">
            <div className="aspect-square bg-gray-100 relative">
              {imageUrl && !hasFailed ? (
                <Image
                  src={imageUrl}
                  alt={image.originalFilename}
                  fill
                  className="object-cover"
                  unoptimized
                  onError={() => {
                    setFailedImages((prev) => new Set(prev).add(image.id));
                  }}
                />
              ) : hasFailed ? (
                <div className="flex items-center justify-center h-full">
                  <ImageIcon className="h-8 w-8 text-gray-400" />
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="animate-pulse bg-gray-200 w-full h-full" />
                </div>
              )}
            </div>

            <div className="p-3 space-y-2">
              <p className="text-xs font-medium text-gray-900 truncate">
                {image.originalFilename}
              </p>
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  {formatFileSize(image.fileSize)}
                </p>
                <Badge
                  variant={
                    image.status === 'uploaded'
                      ? 'default'
                      : image.status === 'failed'
                      ? 'destructive'
                      : 'secondary'
                  }
                  className="text-xs"
                >
                  {image.status}
                </Badge>
              </div>

              {onDelete && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-2"
                  onClick={() => handleDelete(image.id, image.originalFilename)}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Delete
                </Button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
