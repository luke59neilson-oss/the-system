import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { PORTRAIT_REF } from '@the-system/engine';
import { writeFileDurable } from './store';

/**
 * Character portraits (ROADMAP M4.4, D93). The GM uploads image bytes; the
 * server keeps them in `<campaign dir>/portraits/<sha256>.<ext>` (content
 * addressed, never overwritten or deleted) and the log stores only the file
 * name. Only PNG, JPEG and WebP are accepted, checked by their magic bytes,
 * so nothing scriptable (SVG, HTML) is ever served from this folder.
 */

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

export class PortraitError extends Error {}

/** Stores the image under the campaign and returns its file name (the same bytes give the same name). */
export function savePortrait(campaignDir: string, bytes: Buffer): string {
  if (bytes.length === 0) throw new PortraitError('The image is empty');
  if (bytes.length > PORTRAIT_MAX_BYTES) throw new PortraitError('The image is larger than 2 MB');
  const ext = detectPortrait(bytes);
  if (ext === null) throw new PortraitError('Use a PNG, JPEG or WebP image');
  const name = `${createHash('sha256').update(bytes).digest('hex')}.${ext}`;
  const dir = path.join(campaignDir, 'portraits');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  if (!existsSync(file)) writeFileDurable(file, bytes);
  return name;
}

/** The stored file for a portrait name, or null for anything that is not one (no path tricks). */
export function portraitFile(campaignDir: string, name: string): string | null {
  if (!PORTRAIT_REF.test(name)) return null;
  const file = path.join(campaignDir, 'portraits', name);
  return existsSync(file) ? file : null;
}

/** Content type for a stored portrait name. */
export function portraitType(name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1) as PortraitExt;
  return PORTRAIT_TYPES[ext];
}
