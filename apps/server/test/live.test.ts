// Integration: real listener on a random port, real HTTP and WebSocket clients.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '../src/protocol';
import { createServer } from '../src/server';

describe('live server', () => {
  let dir: string;
  let app: FastifyInstance;
  let base: string;

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'the-system-live-'));
    writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>shell</title>');
    app = await createServer({ webRoot: dir });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as AddressInfo;
    expect(port).not.toBe(30333);
    base = `127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('answers /health with 200', async () => {
    const res = await fetch(`http://${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('sends hello on WebSocket connect', async () => {
    const ws = new WebSocket(`ws://${base}/ws`);
    try {
      const first = await new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('no hello within 5s')), 5_000);
        ws.addEventListener('message', (event) => {
          clearTimeout(timer);
          resolve(JSON.parse(String(event.data)));
        });
        ws.addEventListener('error', () => reject(new Error('WebSocket error')));
      });
      expect(first).toMatchObject({
        type: 'hello',
        protocol: PROTOCOL_VERSION,
        server: 'the-system',
      });
    } finally {
      ws.close();
    }
  });

  it('does not upgrade other paths', async () => {
    const ws = new WebSocket(`ws://${base}/not-ws`);
    const outcome = await new Promise<string>((resolve) => {
      ws.addEventListener('open', () => resolve('open'));
      ws.addEventListener('error', () => resolve('error'));
    });
    ws.close();
    expect(outcome).toBe('error');
  });
});
