import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, type NetworkInterfaceInfo } from 'node:os';
import path from 'node:path';
import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { addressRank, joinInfo, qrSvg, rankedLanAddresses } from '../src/join';
import { newGmKey } from '../src/security';
import { createServer } from '../src/server';
import { CampaignStore } from '../src/store';

function v4(address: string, internal = false): NetworkInterfaceInfo {
  return {
    address,
    netmask: '255.255.255.0',
    family: 'IPv4',
    mac: '00:00:00:00:00:00',
    internal,
    cidr: `${address}/24`,
  };
}

/**
 * Decodes our own SVG: reads every `M x y h1v1h-1z` module and the viewBox,
 * paints them into an RGBA bitmap at 4 px per module, then runs a real QR
 * reader over the pixels. Fails if the SVG has any other drawing shape.
 */
function decodeSvg(svg: string): string | null {
  const view = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
  if (!view) throw new Error('no viewBox');
  const size = Number(view[1]);
  const d = /<path fill="#000" d="([^"]*)"/.exec(svg)?.[1] ?? '';
  const scale = 4;
  const px = size * scale;
  const data = new Uint8ClampedArray(px * px * 4).fill(255);
  let rest = d;
  const cell = /^M(\d+) (\d+)h1v1h-1z/;
  while (rest.length > 0) {
    const m = cell.exec(rest);
    if (!m) throw new Error(`unexpected path data: ${rest.slice(0, 20)}`);
    const x = Number(m[1]);
    const y = Number(m[2]);
    for (let dy = 0; dy < scale; dy++) {
      for (let dx = 0; dx < scale; dx++) {
        const i = ((y * scale + dy) * px + (x * scale + dx)) * 4;
        data[i] = data[i + 1] = data[i + 2] = 0;
      }
    }
    rest = rest.slice(m[0].length);
  }
  return jsQR(data, px, px)?.data ?? null;
}

describe('addressRank', () => {
  it('prefers home-network ranges and pushes link-local and CGNAT last', () => {
    expect(addressRank('192.168.1.5')).toBe(0);
    expect(addressRank('10.0.0.2')).toBe(1);
    expect(addressRank('172.16.0.1')).toBe(2);
    expect(addressRank('172.31.255.1')).toBe(2);
    expect(addressRank('172.32.0.1')).toBe(3);
    expect(addressRank('8.8.8.8')).toBe(3);
    expect(addressRank('100.64.0.1')).toBe(4);
    expect(addressRank('100.127.0.1')).toBe(4);
    expect(addressRank('100.128.0.1')).toBe(3);
    expect(addressRank('169.254.3.4')).toBe(5);
  });
});

describe('rankedLanAddresses', () => {
  it('lists non-internal IPv4 only, best first, stable within a rank', () => {
    const interfaces = {
      lo: [v4('127.0.0.1', true)],
      tailscale0: [v4('100.101.1.2')],
      docker0: [v4('172.17.0.1')],
      wlan0: [
        v4('192.168.0.20'),
        {
          address: 'fe80::1',
          netmask: 'ffff:ffff:ffff:ffff::',
          family: 'IPv6' as const,
          mac: '00:00:00:00:00:00',
          internal: false,
          cidr: 'fe80::1/64',
          scopeid: 2,
        },
      ],
      eth1: [v4('169.254.10.10')],
      eth0: [v4('192.168.1.9')],
    };
    expect(rankedLanAddresses(interfaces)).toEqual([
      '192.168.0.20',
      '192.168.1.9',
      '172.17.0.1',
      '100.101.1.2',
      '169.254.10.10',
    ]);
  });
});

describe('joinInfo', () => {
  it('builds ranked URLs with the best one as the QR target', () => {
    const info = joinInfo('0.0.0.0', 30333, {
      docker0: [v4('172.17.0.1')],
      wlan0: [v4('192.168.1.5')],
    });
    expect(info.urls).toEqual(['http://192.168.1.5:30333', 'http://172.17.0.1:30333']);
    expect(info.url).toBe('http://192.168.1.5:30333');
    expect(decodeSvg(info.qrSvg)).toBe(info.url);
  });

  it('falls back to localhost when offline and uses a specific bind host as is', () => {
    expect(joinInfo('0.0.0.0', 4000, {}).url).toBe('http://127.0.0.1:4000');
    expect(joinInfo('192.168.7.7', 4000, { wlan0: [v4('192.168.1.5')] }).urls).toEqual([
      'http://192.168.7.7:4000',
    ]);
  });
});

describe('qrSvg', () => {
  it('decodes back to the exact URL for typical and long join URLs', () => {
    for (const url of [
      'http://192.168.1.5:30333',
      'http://10.0.0.254:65535',
      'http://172.16.200.200:30333/join?c=abc-def',
      'http://my-laptop.local:30333',
    ]) {
      expect(decodeSvg(qrSvg(url)), url).toBe(url);
    }
  });

  it('is a standalone black-on-white SVG with a quiet zone and escaped label', () => {
    const svg = qrSvg('http://a.local:1/?x="<&>"');
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('fill="#fff"');
    expect(svg).toContain('aria-label="QR code: http://a.local:1/?x=&quot;&lt;&amp;&gt;&quot;"');
    expect(svg).not.toMatch(/M[0-3] |M\d+ [0-3]h/); // nothing drawn inside the 4-module margin
    expect(decodeSvg(svg)).toBe('http://a.local:1/?x="<&>"');
  });
});

describe('GET /api/join', () => {
  it('is GM-only, returns the join info, and never contains the GM key', async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-join-'));
    const webDir = mkdtempSync(path.join(tmpdir(), 'the-system-web-'));
    writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><title>shell</title>');
    const store = CampaignStore.open('main', { dataDir, now: () => new Date().toISOString() });
    const gmKey = newGmKey();
    let port: number | null = null;
    const app = await createServer({
      webRoot: webDir,
      live: { store, gmKey, now: () => '2026-10-21T12:00:00.000Z', newId: () => 'x' },
      joinInfo: () =>
        port === null ? null : joinInfo('0.0.0.0', port, { wlan0: [v4('192.168.1.5')] }),
    });
    try {
      const gm = { 'x-gm-key': gmKey };
      expect((await app.inject({ url: '/api/join' })).statusCode).toBe(403);
      expect(
        (await app.inject({ url: '/api/join', headers: { 'x-gm-key': 'no' } })).statusCode,
      ).toBe(403);
      expect((await app.inject({ url: '/api/join', headers: gm })).statusCode).toBe(503);
      port = 30333;
      const res = await app.inject({ url: '/api/join', headers: gm });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ url: string; urls: string[]; qrSvg: string }>();
      expect(body.url).toBe('http://192.168.1.5:30333');
      expect(body.urls).toEqual([body.url]);
      expect(decodeSvg(body.qrSvg)).toBe(body.url);
      expect(res.body).not.toContain(gmKey);
    } finally {
      await app.close();
      store.close();
      rmSync(dataDir, { recursive: true, force: true });
      rmSync(webDir, { recursive: true, force: true });
    }
  });
});
