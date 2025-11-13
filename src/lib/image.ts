import sharp from 'sharp';

/**
 * Convert image to PNG format using sharp
 * - Resize to max 2048×2048 (maintain aspect ratio, only if larger)
 * - Convert to PNG
 * - Compress with quality=90
 */
export async function convertToPNG(buffer: Buffer): Promise<Buffer> {
  return await sharp(buffer)
    .resize(2048, 2048, {
      fit: 'inside',
      withoutEnlargement: true, // Only resize if larger than 2048×2048
    })
    .png({ quality: 90 })
    .toBuffer();
}

/**
 * Validate that buffer is a valid image
 * Returns true if successful, false otherwise
 */
export async function validateImageBuffer(buffer: Buffer): Promise<boolean> {
  try {
    await sharp(buffer).metadata();
    return true;
  } catch {
    return false;
  }
}
