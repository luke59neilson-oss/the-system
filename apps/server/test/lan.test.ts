import type { NetworkInterfaceInfo } from 'node:os';
import { describe, expect, it } from 'vitest';
import { joinUrls, lanIPv4Addresses } from '../src/lan';

const v4 = (address: string, internal = false): NetworkInterfaceInfo => ({
  address,
  netmask: '255.255.255.0',
  family: 'IPv4',
  mac: '00:00:00:00:00:00',
  internal,
  cidr: `${address}/24`,
});
const v6 = (address: string): NetworkInterfaceInfo => ({
  address,
  netmask: 'ffff:ffff:ffff:ffff::',
  family: 'IPv6',
  mac: '00:00:00:00:00:00',
  internal: false,
  cidr: `${address}/64`,
  scopeid: 0,
});

const interfaces = {
  lo: [v4('127.0.0.1', true)],
  wlan0: [v6('fe80::1'), v4('192.168.1.5')],
  eth0: [v4('10.0.0.7'), v4('192.168.1.5')],
  down: undefined,
};

describe('lanIPv4Addresses', () => {
  it('keeps non-internal IPv4 addresses once, in order', () => {
    expect(lanIPv4Addresses(interfaces)).toEqual(['192.168.1.5', '10.0.0.7']);
  });
  it('accepts the numeric family some Node versions report', () => {
    const legacy = { ...v4('192.168.0.9'), family: 4 } as unknown as NetworkInterfaceInfo;
    expect(lanIPv4Addresses({ eth0: [legacy] })).toEqual(['192.168.0.9']);
  });
  it('returns nothing when offline', () => {
    expect(lanIPv4Addresses({ lo: [v4('127.0.0.1', true)] })).toEqual([]);
  });
});

describe('joinUrls', () => {
  it('lists LAN addresses for a wildcard bind', () => {
    expect(joinUrls('0.0.0.0', 30333, interfaces)).toEqual([
      'http://192.168.1.5:30333',
      'http://10.0.0.7:30333',
    ]);
  });
  it('falls back to localhost when offline', () => {
    expect(joinUrls('0.0.0.0', 30333, {})).toEqual(['http://127.0.0.1:30333']);
  });
  it('uses the bound host otherwise, bracketing IPv6', () => {
    expect(joinUrls('127.0.0.1', 4000, interfaces)).toEqual(['http://127.0.0.1:4000']);
    expect(joinUrls('::1', 4000, interfaces)).toEqual(['http://[::1]:4000']);
  });
});
