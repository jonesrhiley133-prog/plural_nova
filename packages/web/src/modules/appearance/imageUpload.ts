import { api } from '../../core/api.js';

/**
 * Backgrounds are photographs; uploaded as-is they would be several MB that
 * every launch has to fetch. They are scaled to at most 1920px on the long
 * edge and re-encoded as JPEG before upload, which is plenty for a backdrop
 * that is blurred and dimmed anyway.
 */
export async function compressImage(file: File, maxEdge = 1920, quality = 0.8): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  return blob && blob.size < file.size ? blob : file;
}

/** Compresses then uploads, returning the stored URL. */
export async function uploadBackground(file: File): Promise<string> {
  const blob = await compressImage(file);
  const result = await api.post<{ url: string }>('/api/media/upload', undefined, {
    raw: {
      body: blob,
      contentType: blob.type || 'application/octet-stream',
      headers: { 'x-file-name': encodeURIComponent(file.name).slice(0, 180) },
    },
    timeoutMs: 120_000,
  });
  return result.url;
}
