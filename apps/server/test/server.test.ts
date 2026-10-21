import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer, isReservedPath } from '../src/server';

describe('createServer', () => {
  let dir: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'the-system-web-'));
    writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>shell</title>');
    writeFileSync(path.join(dir, 'app.js'), 'console.log(1)');
    app = await createServer({ webRoot: dir });
  });

  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves the app shell at /', async () => {
    const res = await app.inject({ url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('shell');
  });

  it('serves static assets', async () => {
    const res = await app.inject({ url: '/app.js' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('console.log');
  });

  const html = { accept: 'text/html,application/xhtml+xml' };

  it('falls back to the shell for browser navigations to client routes', async () => {
    for (const url of ['/sheet/abc', '/sheet/john.smith', '/apiary', '/wsx?x=1']) {
      const res = await app.inject({ url, headers: html });
      expect(res.statusCode, url).toBe(200);
      expect(res.body, url).toContain('shell');
    }
    expect(
      (await app.inject({ method: 'HEAD', url: '/sheet/abc', headers: html })).statusCode,
    ).toBe(200);
  });

  it('404s missing assets, non-page requests and server-owned paths', async () => {
    expect((await app.inject({ url: '/missing.js' })).statusCode).toBe(404);
    expect((await app.inject({ url: '/sheet/abc' })).statusCode).toBe(404);
    for (const url of ['/api', '/api/nope', '/health/x', '/ws/x?y=1']) {
      expect((await app.inject({ url, headers: html })).statusCode, url).toBe(404);
    }
    expect(
      (await app.inject({ method: 'POST', url: '/sheet/abc', headers: html })).statusCode,
    ).toBe(404);
  });

  it('answers /health and refuses a plain GET on /ws', async () => {
    expect((await app.inject({ url: '/health', headers: html })).json()).toEqual({ status: 'ok' });
    expect((await app.inject({ url: '/ws', headers: html })).statusCode).toBeGreaterThanOrEqual(
      400,
    );
  });

  it('fails clearly when the web build is missing', async () => {
    await expect(createServer({ webRoot: path.join(dir, 'nope') })).rejects.toThrow(
      /Web build not found/,
    );
  });
});

describe('isReservedPath', () => {
  it('matches server-owned paths exactly or as prefixes', () => {
    expect(isReservedPath('/api')).toBe(true);
    expect(isReservedPath('/api/x')).toBe(true);
    expect(isReservedPath('/health')).toBe(true);
    expect(isReservedPath('/ws')).toBe(true);
    expect(isReservedPath('/apiary')).toBe(false);
    expect(isReservedPath('/')).toBe(false);
  });
});
