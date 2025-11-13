'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Loader2, XCircle, Image as ImageIcon } from 'lucide-react';
import Image from 'next/image';
import type { UploadedImage, GeneratedImage } from '@/lib/types';

interface ImageComparisonProps {
  uploadedImage: UploadedImage;
  generatedImage: GeneratedImage | null;
  getImageUrl: (r2Key: string) => Promise<string>;
}

export function ImageComparison({
  uploadedImage,
  generatedImage,
  getImageUrl,
}: ImageComparisonProps) {
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [loadingUrls, setLoadingUrls] = useState(true);

  useEffect(() => {
    const loadUrls = async () => {
      try {
        const uploadedImageUrl = await getImageUrl(uploadedImage.r2Key);
        setUploadedUrl(uploadedImageUrl);

        if (generatedImage?.r2Key) {
          const generatedImageUrl = await getImageUrl(generatedImage.r2Key);
          setGeneratedUrl(generatedImageUrl);
        }
      } catch (error) {
        console.error('Failed to load image URLs:', error);
      } finally {
        setLoadingUrls(false);
      }
    };

    loadUrls();
  }, [uploadedImage.r2Key, generatedImage?.r2Key, getImageUrl]);

  const renderGeneratedImage = () => {
    if (!generatedImage || generatedImage.status === 'pending') {
      return (
        <div className="flex flex-col items-center justify-center h-64 bg-gray-50 rounded-lg">
          <ImageIcon className="h-12 w-12 text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">Waiting for generation...</p>
        </div>
      );
    }

    if (generatedImage.status === 'processing') {
      return (
        <div className="flex flex-col items-center justify-center h-64 bg-gray-50 rounded-lg">
          <Loader2 className="h-12 w-12 text-yellow-500 animate-spin mb-2" />
          <p className="text-sm text-gray-600">Generating...</p>
        </div>
      );
    }

    if (generatedImage.status === 'failed') {
      return (
        <div className="flex flex-col items-center justify-center h-64 bg-red-50 rounded-lg">
          <XCircle className="h-12 w-12 text-red-500 mb-2" />
          <p className="text-sm text-red-600 font-medium">Generation Failed</p>
          {generatedImage.errorMessage && (
            <p className="text-xs text-red-500 mt-1 text-center px-4">
              {generatedImage.errorMessage}
            </p>
          )}
        </div>
      );
    }

    if (generatedImage.status === 'completed' && generatedUrl) {
      return (
        <div className="relative h-64 bg-gray-50 rounded-lg overflow-hidden cursor-pointer group">
          <Image
            src={generatedUrl}
            alt="Generated image"
            fill
            className="object-contain group-hover:opacity-90 transition-opacity"
            onClick={() => window.open(generatedUrl, '_blank')}
          />
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center h-64 bg-gray-50 rounded-lg">
        <ImageIcon className="h-12 w-12 text-gray-300 mb-2" />
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  };

  return (
    <Card className="p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Original Image */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Original</h4>
          {loadingUrls || !uploadedUrl ? (
            <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
              <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
            </div>
          ) : (
            <div className="relative h-64 bg-gray-50 rounded-lg overflow-hidden cursor-pointer group">
              <Image
                src={uploadedUrl}
                alt={uploadedImage.originalFilename}
                fill
                className="object-contain group-hover:opacity-90 transition-opacity"
                onClick={() => window.open(uploadedUrl, '_blank')}
              />
            </div>
          )}
          <p className="text-xs text-gray-500 mt-1 truncate">
            {uploadedImage.originalFilename}
          </p>
        </div>

        {/* Generated Image */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Generated</h4>
          {renderGeneratedImage()}
          {generatedImage?.background && (
            <p className="text-xs text-gray-500 mt-1 capitalize">
              Background: {generatedImage.background.replace('_', ' ')}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
