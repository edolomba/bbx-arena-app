/** Centre-crop an image file to a square, scale it and encode as WebP (JPEG where WebP encoding isn't available). */
export async function prepareSquareImage(file: File, size = 512): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();
  const encode = (type: string, q: number) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, q));
  const webp = await encode('image/webp', 0.88);
  if (webp && webp.type === 'image/webp') return webp;
  const png = await encode('image/png', 1);
  if (!png) throw new Error('encode');
  return png;
}
