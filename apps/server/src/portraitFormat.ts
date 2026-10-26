// Portrait formats (M4.4), apart from portraits.ts so the store can check
// imported portraits (MT.10) without an import cycle.

/** Largest upload accepted; the GM screen downsizes to 512 px first, so real ones are far smaller. */
export const PORTRAIT_MAX_BYTES = 2 * 1024 * 1024;

export const PORTRAIT_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
} as const;
export type PortraitExt = keyof typeof PORTRAIT_TYPES;

/** The image format by magic bytes, or null when it is not PNG, JPEG or WebP. */
export function detectPortrait(bytes: Uint8Array): PortraitExt | null {
  const at = (i: number) => bytes[i];
  const ascii = (from: number, text: string) =>
    [...text].every((ch, i) => at(from + i) === ch.charCodeAt(0));
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => at(i) === b)
  ) {
    return 'png';
  }
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'jpg';
  if (bytes.length >= 12 && ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'webp';
  return null;
}
