// QF.54: a slow follow-up step (the session-end backup and report) returns a
// promise: every other client is told at once, and the acting client's
// result waits for the step and carries its warning.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '@the-system/engine';
import { LiveHub } from '../src/hub';
import type { ServerMessage } from '../src/protocol';
import { CampaignStore } from '../src/store';

const KEY = 'k'.repeat(32);
let dataDir = '';
afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

function setup(step: () => Promise<string | null>) {
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-after-'));
  const store = CampaignStore.open('main', { dataDir, now: () => '2026-10-21T00:00:00.000Z' });
  let n = 0;
  let slow = false;
  const hub = new LiveHub(store, {
    gmKey: KEY,
    now: () => '2026-10-21T00:00:00.000Z',
    newId: () => `e${++n}`,
    afterAppend: () => (slow ? step() : null),
  });
  const gm: ServerMessage[] = [];
  const other: ServerMessage[] = [];
  const a = hub.connect((m) => gm.push(m));
  a.receive(JSON.stringify({ type: 'join', role: 'gm', gmKey: KEY, lastSeq: 0 }));
  hub
    .connect((m) => other.push(m))
    .receive(JSON.stringify({ type: 'join', role: 'gm', gmKey: KEY, lastSeq: 0 }));
  const send = (requestId: string, command: object) =>
    a.receive(JSON.stringify({ type: 'command', requestId, command }));
  send('c', {
    type: 'campaign.create',
    name: 'W',
    rules: JSON.parse(JSON.stringify(DEFAULT_RULES)),
  });
  slow = true;
  return { gm, other, send };
}

const resultOf = (got: ServerMessage[], id: string) =>
  got.find((m) => m.type === 'result' && m.requestId === id);

describe('LiveHub async afterAppend (QF.54)', () => {
  it('tells everyone at once and answers once the step is done, with its warning', async () => {
    let finish: (w: string | null) => void = () => undefined;
    const { gm, other, send } = setup(() => new Promise((resolve) => (finish = resolve)));
    other.length = 0;
    send('s', { type: 'session.start' });
    expect(other.some((m) => m.type === 'statePatch' || m.type === 'state')).toBe(true);
    expect(resultOf(gm, 's')).toBeUndefined();
    finish('the backup could not be saved');
    await new Promise((resolve) => setImmediate(resolve));
    expect(resultOf(gm, 's')).toEqual({
      type: 'result',
      requestId: 's',
      ok: true,
      warning: 'the backup could not be saved',
    });
  });

  it('a failed step still answers ok with a warning', async () => {
    const { gm, send } = setup(() => Promise.reject(new Error('boom')));
    send('s', { type: 'session.start' });
    await new Promise((resolve) => setImmediate(resolve));
    expect(resultOf(gm, 's')).toMatchObject({
      ok: true,
      warning: 'The change was saved, but a follow-up step failed',
    });
  });
});
