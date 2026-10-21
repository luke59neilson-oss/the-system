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

/**
 * Host header check (defeats DNS rebinding: a rebound attacker domain arrives
 * with its own name as Host). Allowed: localhost, IP literals, `*.local`
 * mDNS names, and listed extra hosts. Port is ignored.
 */
export function isAllowedHost(
  host: string | undefined,
  extraHosts: readonly string[] = [],
): boolean {
  if (host === undefined) return false;
  const value = host.trim().toLowerCase();
  if (value === '') return false;
  let name: string;
  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    if (end === -1) return false;
    name = value.slice(1, end);
    return /^[0-9a-f:.]+$/.test(name) && name.includes(':');
  }
  name = value.replace(/:\d+$/, '');
  if (extraHosts.map((h) => h.toLowerCase()).includes(name)) return true;
  if (name === 'localhost') return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(name)) return name.split('.').every((n) => Number(n) <= 255);
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.local$/.test(name);
}

/**
 * Normalized request path for authorization: decoded, dot-segments resolved,
 * query dropped. Returns null for anything unparseable or not origin-form
 * (absolute-form URLs, `*`), which callers must refuse.
 */
export function authPath(url: string): string | null {
  if (!url.startsWith('/')) return null;
  try {
    // Prefix the origin ourselves: `new URL('//x', base)` would read "x" as a host.
    const pathname = new URL(`http://h${url}`).pathname;
    const decoded = decodeURIComponent(pathname);
    if (!decoded.startsWith('/')) return null;
    return new URL(`http://h${decoded}`).pathname.replace(/\/{2,}/g, '/').toLowerCase();
  } catch {
    return null;
  }
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
