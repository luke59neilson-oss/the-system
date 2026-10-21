// Integration (MS.4): the demo campaign lives in its own directory and the
// switch between it and the real campaign never mixes their data.
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  DEMO_CHARACTERS,
  STARTER_CLASSES,
  execute,
  type Command,
} from '@the-system/engine';
import { DEMO_CAMPAIGN_ID, createServer } from '../src/server';
import { CampaignStore } from '../src/store';

const GM_KEY = 'demo-test-gm-key-0123456789abcdef';

describe('demo campaign switch', () => {
  let dir: string;
  let dataDir: string;
  let app: FastifyInstance;
  let base: string;
  let store: CampaignStore;
  let n = 0;
  const now = () => '2026-10-21T00:00:00.000Z';
  const newId = () => `t-${++n}`;

  const run = (command: Command) => {
    const result = execute(store.campaign, command, {
      actor: { role: 'gm' },
      sessionId: null,
      now,
      newId,
    });
    if (!result.ok) throw new Error(result.error);
    store.appendAll(result.events);
  };
  const gm = (method: 'GET' | 'POST', body?: unknown, key: string | null = GM_KEY) =>
    fetch(`http://${base}/api/gm/campaign`, {
      method,
      headers: {
        ...(key ? { 'x-gm-key': key } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? null : JSON.stringify(body),
    });
  const names = async () =>
    ((await (await fetch(`http://${base}/api/characters`)).json()) as { name: string }[]).map(
      (c) => c.name,
    );

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'the-system-demo-web-'));
    dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-demo-data-'));
    writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>shell</title>');
    store = CampaignStore.open('main', { dataDir, now });
    run({ type: 'campaign.create', name: 'Real campaign', rules: DEFAULT_RULES });
    run({
      type: 'character.create',
      id: 'real-ada',
      name: 'Ada',
      className: 'Archer',
      classSkills: STARTER_CLASSES[0]?.skills ?? [],
    });
    app = await createServer({
      webRoot: dir,
      live: { store, gmKey: GM_KEY, now, newId },
      openCampaign: (id) => CampaignStore.open(id, { dataDir, now }),
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    base = `127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await app?.close();
    store?.close();
    rmSync(dir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('is GM-only', async () => {
    expect((await gm('GET', undefined, null)).status).toBe(403);
    expect((await gm('POST', { demo: true }, 'wrong')).status).toBe(403);
    expect(await (await gm('GET')).json()).toEqual({ id: 'main', demo: false });
  });

  it('rejects a body without a boolean demo flag', async () => {
    expect((await gm('POST', { demo: 'yes' })).status).toBe(400);
    expect((await gm('POST', { id: 'other' })).status).toBe(400);
  });

  it('loads the demo in its own directory, drops open sockets, and never touches the real log', async () => {
    const realEvents = store.campaign.events.length;
    const ws = new WebSocket(`ws://${base}/ws`);
    await new Promise((resolve) => ws.addEventListener('open', resolve));
    const closed = new Promise<number>((resolve) =>
      ws.addEventListener('close', (e) => resolve(e.code)),
    );

    const res = await gm('POST', { demo: true });
    expect(await res.json()).toEqual({ id: DEMO_CAMPAIGN_ID, demo: true });
    expect(await closed).toBe(1012);
    expect(await names()).toEqual(DEMO_CHARACTERS.map((c) => c.name));
    expect(existsSync(path.join(dataDir, 'campaigns', DEMO_CAMPAIGN_ID, 'events.jsonl'))).toBe(
      true,
    );
    expect(store.campaign.events.length).toBe(realEvents);
    expect(JSON.stringify(store.campaign.state)).not.toContain('demo-');
    // The real campaign's export carries nothing of the demo either.
    expect(JSON.stringify(store.exportCampaign())).not.toContain('demo-jake');

    // Back to the real campaign.
    expect(await (await gm('POST', { demo: false })).json()).toEqual({ id: 'main', demo: false });
    expect(await names()).toEqual(['Ada']);
  });

  it('keeps the demo as the GM left it on a later load (seeded once)', async () => {
    await gm('POST', { demo: true });
    const first = await names();
    await gm('POST', { demo: false });
    await gm('POST', { demo: true });
    expect(await names()).toEqual(first);
    expect(await (await gm('GET')).json()).toEqual({ id: DEMO_CAMPAIGN_ID, demo: true });
    await gm('POST', { demo: false });
  });
});
