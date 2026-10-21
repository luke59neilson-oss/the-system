import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../src/server';

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

  it('falls back to the shell for client routes', async () => {
    const res = await app.inject({ url: '/sheet/abc' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('shell');
  });

  it('404s missing assets and api paths', async () => {
    expect((await app.inject({ url: '/missing.js' })).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/nope' })).statusCode).toBe(404);
  });

  it('fails clearly when the web build is missing', async () => {
    await expect(createServer({ webRoot: path.join(dir, 'nope') })).rejects.toThrow(
      /Web build not found/,
    );
  });
});
