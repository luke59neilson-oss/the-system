import type { NetworkInterfaceInfo } from 'node:os';

type Interfaces = NodeJS.Dict<NetworkInterfaceInfo[]>;

/** Non-internal IPv4 addresses, in interface order, without duplicates. Pure. */
export function lanIPv4Addresses(interfaces: Interfaces): string[] {
  const out: string[] = [];
  for (const infos of Object.values(interfaces)) {
    for (const info of infos ?? []) {
      // Node 18.0-18.3 reported family as the number 4.
      const family: unknown = info.family;
      const isV4 = family === 'IPv4' || family === 4;
      if (isV4 && !info.internal && !out.includes(info.address)) out.push(info.address);
    }
  }
  return out;
}

/**
 * Addresses players can use to join. For a wildcard bind these are the LAN
 * IPv4 addresses (falling back to localhost when offline); otherwise the bound host.
 */
export function joinUrls(host: string, port: number, interfaces: Interfaces): string[] {
  if (!isWildcardHost(host)) return [`http://${host.includes(':') ? `[${host}]` : host}:${port}`];
  const lan = lanIPv4Addresses(interfaces);
  return (lan.length > 0 ? lan : ['127.0.0.1']).map((ip) => `http://${ip}:${port}`);
}

/** True for bind hosts that listen on every interface. */
export function isWildcardHost(host: string): boolean {
  return host === '0.0.0.0' || host === '::' || host === '';
}
