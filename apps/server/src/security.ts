import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Pure security checks for the live server (ROADMAP M2.2, DESIGN §7 "GM
 * security"). Kept free of Fastify so they can be unit tested directly.
 */

/** Strips the IPv4-mapped IPv6 prefix: "::ffff:192.168.1.5" → "192.168.1.5". */
export function normalizeAddress(address: string): string {
  const lower = address.trim().toLowerCase();
  return lower.startsWith('::ffff:') && lower.includes('.') ? lower.slice(7) : lower;
}

/** True for loopback addresses (127.0.0.0/8, ::1, and their mapped forms). */
export function isLoopback(address: string): boolean {
  const a = normalizeAddress(address);
  return a === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(a);
}

/**
 * Origin check for WebSocket upgrades. A missing Origin (non-browser client)
 * passes: the threat is a page on another site driving a visitor's browser.
 * A present Origin must be same-origin with the Host header, or listed.
 */
export function isAllowedOrigin(
  origin: string | undefined,
  host: string | undefined,
  extraOrigins: readonly string[] = [],
): boolean {
  if (origin === undefined) return true;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (extraOrigins.includes(parsed.origin)) return true;
  if (host === undefined || host.trim() === '') return false;
  return parsed.host.toLowerCase() === host.trim().toLowerCase();
}

/** A fresh GM key (256 random bits, hex). */
export function newGmKey(): string {
  return randomBytes(32).toString('hex');
}

/** Constant-time GM key comparison; false for missing or non-string keys. */
export function gmKeyMatches(expected: string, given: unknown): boolean {
  if (typeof given !== 'string' || given === '' || expected === '') return false;
  // Hash both so lengths match and timing does not reveal the key length.
  const a = createHash('sha256').update(expected).digest();
  const b = createHash('sha256').update(given).digest();
  return timingSafeEqual(a, b);
}
