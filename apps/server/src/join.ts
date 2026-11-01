import type { NetworkInterfaceInfo } from 'node:os';
import QRCode from 'qrcode';
import { isWildcardHost, joinUrls, lanIPv4Addresses } from './lan';

/**
 * Join helper (ROADMAP M2.3): the addresses players can type or scan to reach
 * this server. Pure: interfaces come in as data. The URLs carry no secret; the
 * GM key never appears in a join URL or QR (DESIGN §7).
 */

type Interfaces = NodeJS.Dict<NetworkInterfaceInfo[]>;

export interface JoinInfo {
  /** Join URLs, most likely home-network address first. */
  urls: string[];
  /** The URL to show big and encode in the QR (first of `urls`). */
  url: string;
  /** Standalone SVG QR code of `url`. */
  qrSvg: string;
  /** Every join URL with its own QR, same order as `urls`, so the GM can pick another. */
  options: { url: string; qrSvg: string }[];
  /**
   * The server computer's OS (M10.1), so the GM screen's "Players can't
   * connect?" help names the right firewall. Set by `startApp`.
   */
  platform?: string;
}

/**
 * Ranks an IPv4 address by how likely it is the home wifi/LAN a phone is on:
 * 192.168/16, then 10/8, then 172.16/12, then other addresses, then
 * link-local 169.254/16 (no DHCP) and CGNAT 100.64/10 (VPN overlays) last.
 */
export function addressRank(address: string): number {
  const parts = address.split('.').map(Number);
  const [a = 0, b = 0] = parts;
  if (a === 192 && b === 168) return 0;
  if (a === 10) return 1;
  if (a === 172 && b >= 16 && b <= 31) return 2;
  if (a === 169 && b === 254) return 5;
  if (a === 100 && b >= 64 && b <= 127) return 4;
  return 3;
}

/** MAC prefixes of common virtual adapters (VirtualBox, VMware, Hyper-V, Parallels). */
const VIRTUAL_MACS = [
  '0a:00:27',
  '08:00:27',
  '00:50:56',
  '00:0c:29',
  '00:05:69',
  '00:1c:14',
  '00:15:5d',
  '00:1c:42',
];
const VIRTUAL_NAMES = /virtualbox|vmware|vmnet|vethernet|hyper-v|docker|wsl|vbox|parallels/i;

/**
 * QF.62 (deep review desktop-6): a virtual adapter (a VM host network, Hyper-V
 * or WSL switch, Windows Mobile Hotspot on 192.168.137.x, VirtualBox's
 * 192.168.56.x) is never the wifi a phone is on, so it ranks below every real
 * home range, even on a 10.x home network.
 */
export function isVirtualAdapter(name: string, info: NetworkInterfaceInfo): boolean {
  const mac = info.mac.toLowerCase();
  return (
    VIRTUAL_NAMES.test(name) ||
    VIRTUAL_MACS.some((p) => mac.startsWith(p)) ||
    /^192\.168\.(137|56)\./.test(info.address)
  );
}

/** LAN IPv4 addresses ordered by `addressRank`, interface order within a rank. */
export function rankedLanAddresses(interfaces: Interfaces): string[] {
  const virtual = new Set<string>();
  for (const [name, infos] of Object.entries(interfaces)) {
    for (const info of infos ?? []) if (isVirtualAdapter(name, info)) virtual.add(info.address);
  }
  return lanIPv4Addresses(interfaces)
    .map((address, index) => ({
      address,
      index,
      // Below "other addresses" (3), beside VPN overlays (4), above link-local (5).
      rank: virtual.has(address) ? 4 : addressRank(address),
    }))
    .sort((x, y) => x.rank - y.rank || x.index - y.index)
    .map((entry) => entry.address);
}

/** Join URLs for a bind host and port, best address first. */
export function rankedJoinUrls(host: string, port: number, interfaces: Interfaces): string[] {
  // Rank the interfaces (not URL strings), then let joinUrls format them.
  if (!isWildcardHost(host)) return joinUrls(host, port, interfaces);
  const ranked = rankedLanAddresses(interfaces);
  const ordered: Interfaces = { ranked: ranked.map((address) => ({ ...LAN_V4, address })) };
  return joinUrls(host, port, ordered);
}

const LAN_V4: NetworkInterfaceInfo = {
  address: '',
  netmask: '255.255.255.0',
  family: 'IPv4',
  mac: '00:00:00:00:00:00',
  internal: false,
  cidr: null,
};

/** Everything the GM screen needs to show players how to join. */
export function joinInfo(host: string, port: number, interfaces: Interfaces): JoinInfo {
  const urls = rankedJoinUrls(host, port, interfaces);
  const options = urls.map((url) => ({ url, qrSvg: qrSvg(url) }));
  const first = options[0] ?? {
    url: `http://127.0.0.1:${port}`,
    qrSvg: qrSvg(`http://127.0.0.1:${port}`),
  };
  return { urls, url: first.url, qrSvg: first.qrSvg, options };
}

/**
 * QR code as a standalone SVG: dark modules on white with the 4-module quiet
 * zone, one path, crisp edges. Always black on white (phones scan that best,
 * whatever the app theme). Error correction M.
 */
export function qrSvg(text: string): string {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const quiet = 4;
  const size = modules.size + quiet * 2;
  let d = '';
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (modules.get(row, col)) d += `M${col + quiet} ${row + quiet}h1v1h-1z`;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" ` +
    `shape-rendering="crispEdges" role="img" aria-label="QR code: ${escapeXml(text)}">` +
    `<rect width="${size}" height="${size}" fill="#fff"/>` +
    `<path fill="#000" d="${d}"/></svg>`
  );
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
