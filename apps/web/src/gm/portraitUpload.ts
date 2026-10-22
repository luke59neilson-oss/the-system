/**
 * Portrait upload for the GM console (M4.4, D93): shrink the picked image to
 * fit a 512 px square in the browser, then POST the bytes to the server,
 * which stores them by content hash and answers the file name the character
 * events carry.
 */

/** Longest side of a stored portrait, in pixels (display only, not a rule). */
export const PORTRAIT_EDGE = 512;
export const PORTRAIT_ACCEPT = 'image/png,image/jpeg,image/webp';

/** Size that fits within `max` on both sides, keeping the aspect ratio; never enlarges. */
export function fitWithin(width: number, height: number, max = PORTRAIT_EDGE) {
  const scale = Math.min(1, max / Math.max(width, height, 1));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Re-encodes an image file at portrait size (WebP, or PNG where WebP encoding is missing). */
export async function shrinkPortrait(file: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('That file is not an image this browser can read');
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot resize images');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
  const webp = await encode('image/webp');
  const blob = webp?.type === 'image/webp' ? webp : await encode('image/png');
  if (!blob) throw new Error('Could not resize the image');
  return blob;
}

export type UploadResult = { ok: true; portrait: string } | { ok: false; error: string };

/** Sends the image to the server; resolves with the stored file name or a readable error. */
export async function uploadPortrait(gmKey: string, image: Blob): Promise<UploadResult> {
  try {
    const r = await fetch('/api/gm/portraits', {
      method: 'POST',
      headers: { 'x-gm-key': gmKey, 'content-type': image.type },
      body: image,
    });
    const body = (await r.json().catch(() => null)) as {
      portrait?: unknown;
      error?: unknown;
    } | null;
    if (r.ok && typeof body?.portrait === 'string') return { ok: true, portrait: body.portrait };
    if (r.status === 413) return { ok: false, error: 'The image is too large' };
    return {
      ok: false,
      error: typeof body?.error === 'string' ? body.error : 'Could not upload the portrait',
    };
  } catch {
    return { ok: false, error: 'Could not reach the server to upload the portrait' };
  }
}
