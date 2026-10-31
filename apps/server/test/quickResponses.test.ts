import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_RULES, execute } from '@the-system/engine';
import { readStream } from '../src/ai/anthropic';
import { requireWhole } from '../src/ai/client';
import { CoDm } from '../src/ai/coDm';
import { FixtureAiClient, streamPieces } from '../src/ai/fake';
import { e2eQuickResponse } from '../src/ai/e2eFake';
import {
  DEFAULT_QUICK_SLOTS,
  QUICK_LORE_MAX,
  QUICK_LORE_NOTE_MAX,
  QUICK_NPC_NOTES_MAX,
  QUICK_SLOT_IDS,
  findTarget,
  isQuestionOrAttempt,
  parseQuick,
  quickPrompt,
  sceneNpc,
} from '../src/ai/quickResponses';
import { createServer } from '../src/server';
import { transcriptsDir } from '../src/speech/routes';
import { transcriptFile, type TranscriptLine } from '../src/speech/transcript';
import { CampaignStore } from '../src/store';

// MD.1 (DESIGN §11 "Quick responses"): five fixed buttons answer the newest
// player question or attempt with one sayable line plus beats, streamed.
const line = (text: string, speaker?: string): TranscriptLine => ({
  at: '2026-10-30T19:00:00.000Z',
  startMs: 0,
  endMs: 1000,
  text,
  ...(speaker ? { speaker } : {}),
});

describe('quick-response helpers (MD.1)', () => {
  it('has the five defaults in DESIGN order', () => {
    expect(DEFAULT_QUICK_SLOTS.map((s) => s.label)).toEqual([
      'Yes, and…',
      'Yes, but…',
      'No, but…',
      'In character',
      'Twist',
    ]);
    expect(DEFAULT_QUICK_SLOTS.map((s) => s.id)).toEqual([...QUICK_SLOT_IDS]);
  });

  it('targets the newest question or attempt, else the newest line', () => {
    expect(isQuestionOrAttempt(line('Can we cross the canyon?'))).toBe(true);
    expect(isQuestionOrAttempt(line('I try to climb the rib.'))).toBe(true);
    expect(isQuestionOrAttempt(line('The wind howls through the canyon.'))).toBe(false);
    const lines = [
      line('Is the herbalist still open?', 'Jake'),
      line('I sneak past the guard.', 'Mira'),
      line('The guard yawns.'),
    ];
    expect(findTarget(lines)?.text).toBe('I sneak past the guard.');
    expect(findTarget([line('The guard yawns.')])?.text).toBe('The guard yawns.');
    expect(findTarget([])).toBeNull();
  });

  it('finds the NPC last named, by name or label, whole words only', () => {
    const npcs = [
      { id: 'tam', names: ['Old Tam', 'the ferryman'] },
      { id: 'sal', names: ['Sal'] },
    ];
    expect(sceneNpc([line('Old Tam waves.'), line('Hello Sal, and the ferryman.')], npcs)).toBe(
      'tam',
    );
    expect(sceneNpc([line('Old Tam waves.'), line('Salt on the wind.')], npcs)).toBe('tam');
    expect(sceneNpc([line('Nobody here.')], npcs)).toBeNull();
  });

  it('builds a bounded prompt with the slot, target, context and lore', () => {
    const p = quickPrompt({
      slot: { id: 'twist', label: 'Twist', instruction: 'Flip it' },
      target: 'I open the door',
      recent: [line('I open the door', 'Jake')],
      context: {
        party: ['Jake'],
        region: 'Rake Canyons',
        npc: { name: 'Old Tam', notes: 'x'.repeat(2000) },
        lore: ['Tam owes the Drum a debt', 'y'.repeat(5000)],
      },
    });
    expect(p.startsWith('Quick response.')).toBe(true);
    expect(p).toContain('Button: Twist');
    expect(p).toContain('Instruction: Flip it');
    expect(p).toContain('Answer this line: "I open the door"');
    expect(p).toContain('Region: Rake Canyons');
    expect(p).toContain('- Tam owes the Drum a debt');
    expect(p).not.toContain('y'.repeat(2000));
    // QF.50: the long note is clipped, not dropped; the prompt stays bounded.
    expect(p).toContain(`- ${'y'.repeat(QUICK_LORE_NOTE_MAX - 1)}…`);
    expect(p.length).toBeLessThan(QUICK_NPC_NOTES_MAX + QUICK_LORE_MAX + 1000);
  });

  it('parses one line plus at most three beats, tolerating drift', () => {
    expect(
      parseQuick('SAY: The door gives.\n- a draught\n- a name: Ilse\n- a hum\n- extra'),
    ).toEqual({ say: 'The door gives.', beats: ['a draught', 'a name: Ilse', 'a hum'] });
    expect(parseQuick('"It holds."\n• one\n2) two')).toEqual({
      say: 'It holds.',
      beats: ['one', 'two'],
    });
    expect(parseQuick('').say).toBe('');
  });

  it('the fake streams word pieces that join back to the text', async () => {
    const text = 'SAY: Yes.\n- a beat\n- b';
    expect(streamPieces(text).join('')).toBe(text);
    const fake = new FixtureAiClient([{ match: 'x', text }]);
    const got: string[] = [];
    const reply = await fake.complete({
      role: 'fast',
      system: '',
      messages: [{ role: 'user', content: 'x' }],
      maxTokens: 10,
      onText: (d) => got.push(d),
    });
    expect(got.length).toBeGreaterThan(2);
    expect(got.join('')).toBe(reply.text);
  });
});

describe('streamed Anthropic replies (MD.1)', () => {
  const sse = (events: object[], split = 7) => {
    const body = events.map((e) => `event: x\ndata: ${JSON.stringify(e)}\n\n`).join('');
    const bytes = new TextEncoder().encode(body);
    return new Response(
      new ReadableStream({
        start(c) {
          for (let i = 0; i < bytes.length; i += split) c.enqueue(bytes.slice(i, i + split));
          c.close();
        },
      }),
    );
  };

  it('passes text deltas on as they come and totals the usage', async () => {
    const got: string[] = [];
    const reply = await readStream(
      sse([
        {
          type: 'message_start',
          message: { model: 'claude-haiku-x', usage: { input_tokens: 12, output_tokens: 1 } },
        },
        { type: 'content_block_start', index: 0 },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'SAY: It ' } },
        { type: 'ping' },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'works.' } },
        { type: 'message_delta', usage: { output_tokens: 9 } },
        { type: 'message_stop' },
      ]),
      'fallback',
      (d) => got.push(d),
    );
    expect(got).toEqual(['SAY: It ', 'works.']);
    expect(reply).toEqual({
      text: 'SAY: It works.',
      model: 'claude-haiku-x',
      usage: { inputTokens: 12, outputTokens: 9 },
    });
  });

  it('reports the stop reason, so a reply cut at its cap is caught (QF.49)', async () => {
    const reply = await readStream(
      sse([
        { type: 'message_start', message: { usage: { input_tokens: 5, output_tokens: 1 } } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: '{"notes":["ha' } },
        {
          type: 'message_delta',
          delta: { stop_reason: 'max_tokens' },
          usage: { output_tokens: 8 },
        },
        { type: 'message_stop' },
      ]),
      'fallback',
      () => undefined,
    );
    expect(reply.stopReason).toBe('max_tokens');
    expect(() => requireWhole(reply)).toThrow(/too long/);
    expect(requireWhole({ ...reply, stopReason: 'end_turn' })).toMatchObject({ text: reply.text });
  });

  it('a stream that errors or ends early is an AI error, with no key in it', async () => {
    const key = 'sk-ant-api03-SECRETSECRET';
    await expect(
      readStream(
        sse([{ type: 'error', error: { message: `overloaded ${key}` } }]),
        'm',
        () => undefined,
        key,
      ),
    ).rejects.toThrow(/stopped mid-answer \(overloaded sk-ant-…\)/u);
    await expect(
      readStream(
        sse([{ type: 'message_start', message: { usage: { input_tokens: 1 } } }]),
        'm',
        () => undefined,
      ),
    ).rejects.toThrow('ended early');
  });

  it('a stream cut off after it started is still counted (review M2)', async () => {
    const { AnthropicClient } = await import('../src/ai/anthropic');
    const { SpendCounter, counted } = await import('../src/ai/client');
    const bytes = new TextEncoder().encode(
      `data: ${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 800, output_tokens: 1 } } })}\n\n` +
        `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'SAY: The rope sn' } })}\n\n`,
    );
    const client = new AnthropicClient(
      () => 'sk-ant-test',
      () => ({ fast: 'claude-haiku-x', strong: 's' }),
      () =>
        Promise.resolve(
          new Response(
            new ReadableStream({
              start(c) {
                c.enqueue(bytes);
                setTimeout(() => c.error(new Error('socket hang up')), 5);
              },
            }),
          ),
        ),
    );
    const counter = new SpendCounter();
    await expect(
      counted(client, counter).complete({
        role: 'fast',
        system: 's',
        messages: [{ role: 'user', content: 'u' }],
        maxTokens: 5,
        onText: () => undefined,
      }),
    ).rejects.toThrow('cut off');
    expect(counter.snapshot()).toMatchObject({ calls: 1, inputTokens: 800, outputTokens: 4 });
  });

  it('the live client asks for a stream only when the caller listens', async () => {
    const { AnthropicClient } = await import('../src/ai/anthropic');
    const bodies: Record<string, unknown>[] = [];
    const client = new AnthropicClient(
      () => 'sk-ant-test',
      () => ({ fast: 'f', strong: 's' }),
      (_url, init) => {
        bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return Promise.resolve(
          sse([
            { type: 'message_start', message: { usage: { input_tokens: 1, output_tokens: 0 } } },
            { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } },
            { type: 'message_delta', usage: { output_tokens: 1 } },
            { type: 'message_stop' },
          ]),
        );
      },
    );
    const got: string[] = [];
    const reply = await client.complete({
      role: 'fast',
      system: 's',
      messages: [{ role: 'user', content: 'u' }],
      maxTokens: 5,
      onText: (d) => got.push(d),
    });
    expect(bodies[0]?.stream).toBe(true);
    expect(reply.text).toBe('hi');
    expect(got).toEqual(['hi']);
  });
});

// ---- routes ----

const GM = 'q'.repeat(32);
const gm = { 'x-gm-key': GM };
let ids = 0;

function campaign(root: string): CampaignStore {
  const now = () => '2026-10-30T07:00:00.000Z';
  const store = CampaignStore.open('main', { dataDir: path.join(root, 'data'), now });
  let n = 0;
  const ctx = { actor: { role: 'gm' as const }, sessionId: null, now, newId: () => `e${++n}` };
  for (const command of [
    { type: 'campaign.create', name: 'Whale', rules: JSON.parse(JSON.stringify(DEFAULT_RULES)) },
    {
      type: 'character.create',
      id: 'jake',
      name: 'Jake',
      className: 'Archer',
      classSkills: [
        { name: 'Basic Archery', rarity: 'inferior' },
        { name: 'Basic One-Handed Weapon', rarity: 'inferior' },
        { name: "Archer's Eye", rarity: 'common' },
      ],
    },
    {
      type: 'entity.define',
      entityId: 'tam',
      name: 'Old Tam',
      label: 'the ferryman',
      tiers: [{ minRarity: 'common', text: 'A ferryman.' }],
    },
    {
      type: 'entity.define',
      entityId: 'sal',
      name: 'Sal',
      label: 'a herbalist',
      tiers: [{ minRarity: 'common', text: 'A herbalist.' }],
    },
  ]) {
    const r = execute(store.campaign, command as never, ctx);
    if (!r.ok) throw new Error(`${command.type}: ${r.error}`);
    store.appendAll(r.events);
  }
  return store;
}

interface Event {
  type: string;
  [k: string]: unknown;
}
const events = (payload: string): Event[] =>
  payload
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as Event);

describe('quick-response routes (MD.1)', () => {
  let root: string;
  let store: CampaignStore;
  let app: FastifyInstance;
  let fake: FixtureAiClient;
  let coDm: CoDm;

  const writeTranscript = (lines: TranscriptLine[]) => {
    mkdirSync(transcriptsDir(store), { recursive: true });
    writeFileSync(
      transcriptFile(transcriptsDir(store), 0),
      lines.map((l) => JSON.stringify(l)).join('\n') + '\n',
    );
  };
  const ask = async (body: Record<string, unknown>) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/gm/ai/quick',
      headers: gm,
      payload: body,
    });
    return { res, events: res.statusCode === 200 ? events(res.payload) : [] };
  };
  const lastPrompt = () =>
    fake.requests.at(-1)?.messages.at(-1)?.content ?? '(no request was made)';

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'the-system-quick-'));
    writeFileSync(path.join(root, 'index.html'), '<!doctype html>');
    store = campaign(root);
    coDm = new CoDm({
      dir: path.join(root, 'app-data'),
      cipher: null,
      makeClient: (_key, models) => {
        fake = new FixtureAiClient(
          [
            {
              role: 'strong',
              match: 'Quick response.',
              text: 'SAY: A richer line.\n- deep beat',
              usage: { inputTokens: 1000, outputTokens: 100 },
            },
            {
              role: 'fast',
              match: 'Button: Broken',
              text: '   ',
            },
            {
              role: 'fast',
              match: 'Button: Slow',
              text: 'SAY: Too late.',
              delayMs: 5000,
            },
            {
              role: 'fast',
              match: 'Quick response.',
              text: 'SAY: The rope holds, and Old Tam laughs.\n- a coin in the rope\n- Tam knows the canyon',
              usage: { inputTokens: 1000, outputTokens: 50 },
            },
          ],
          models(),
        );
        return fake;
      },
    });
    app = await createServer({
      webRoot: root,
      live: { store, gmKey: GM, now: () => '2026-10-30T07:00:00.000Z', newId: () => `h${++ids}` },
      coDm,
    });
  });
  afterAll(async () => {
    await app.close();
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  beforeEach(async () => {
    await app.inject({ method: 'DELETE', url: '/api/gm/ai/quick/settings', headers: gm });
    writeTranscript([
      line('We head down to the river where Old Tam keeps the ferry.'),
      line('Can I swing across on the rope?', 'Jake'),
      line('The rope creaks in the wind.'),
    ]);
  });

  it('is GM-only', async () => {
    for (const [method, url] of [
      ['GET', '/api/gm/ai/quick'],
      ['POST', '/api/gm/ai/quick'],
      ['PUT', '/api/gm/ai/quick/settings'],
      ['DELETE', '/api/gm/ai/quick/settings'],
    ] as const) {
      const res = await app.inject({
        method,
        url,
        ...(method === 'POST' ? { payload: { slot: 1 } } : {}),
      });
      expect(res.statusCode, `${method} ${url}`).toBe(403);
    }
  });

  it('reads the slots, the target line and the NPC last named', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/gm/ai/quick', headers: gm });
    expect(res.json()).toMatchObject({
      slots: DEFAULT_QUICK_SLOTS,
      target: { text: 'Can I swing across on the rope?', speaker: 'Jake' },
      npc: 'tam',
      npcs: [
        { id: 'tam', name: 'Old Tam' },
        { id: 'sal', name: 'Sal' },
      ],
    });
  });

  it('each of the five buttons streams an answer on the fast model, with its instruction', async () => {
    for (const [i, slot] of DEFAULT_QUICK_SLOTS.entries()) {
      const before = coDm.status().spend.calls;
      const { res, events: ev } = await ask({ slot: i + 1 });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/x-ndjson');
      expect(ev[0]).toMatchObject({
        type: 'start',
        slot: { id: slot.id, label: slot.label },
        quote: 'Can I swing across on the rope?',
        npc: { id: 'tam', name: 'Old Tam' },
      });
      const texts = ev.filter((e) => e.type === 'text').map((e) => e.delta as string);
      expect(texts.length).toBeGreaterThan(3);
      expect(ev.at(-1)).toMatchObject({
        type: 'done',
        say: 'The rope holds, and Old Tam laughs.',
        beats: ['a coin in the rope', 'Tam knows the canyon'],
        spend: { calls: before + 1 },
      });
      const request = fake.requests.at(-1)!;
      expect(request.role).toBe('fast');
      expect(lastPrompt()).toContain(`Button: ${slot.label}`);
      expect(lastPrompt()).toContain(`Instruction: ${slot.instruction}`);
      expect(lastPrompt()).toContain('NPC in the scene: Old Tam');
      expect(lastPrompt()).toContain('Party: Jake');
    }
  });

  it('retargets to a clicked or typed line, and the NPC picker overrides', async () => {
    const { events: ev } = await ask({ slot: 4, target: 'Where does the ferry go?', npc: 'sal' });
    expect(ev[0]).toMatchObject({ quote: 'Where does the ferry go?', npc: { name: 'Sal' } });
    expect(lastPrompt()).toContain('Answer this line: "Where does the ferry go?"');
    expect(lastPrompt()).toContain('NPC in the scene: Sal');
    await ask({ slot: 4, npc: null });
    expect(lastPrompt()).toContain('NPC in the scene: (none)');
  });

  it('kept lore for the NPC in the scene reaches the prompt (MD.3)', async () => {
    const ctx = {
      actor: { role: 'gm' as const },
      sessionId: null,
      now: () => '2026-10-30T07:30:00.000Z',
      newId: () => `lore${++ids}`,
    };
    const r = execute(
      store.campaign,
      {
        type: 'note.create',
        characterId: null,
        kind: 'gm',
        title: 'Old Tam',
        body: 'Tam owes the ferryman a debt he will not name.',
        tags: ['lore', 'npc:Old Tam'],
      },
      ctx,
    );
    if (!r.ok) throw new Error(r.error);
    store.appendAll(r.events);
    await ask({ slot: 4, npc: 'tam' });
    expect(lastPrompt()).toContain('Kept lore (do not contradict):');
    expect(lastPrompt()).toContain('- Tam owes the ferryman a debt he will not name.');
    await ask({ slot: 4, npc: 'sal' });
    expect(lastPrompt()).not.toContain('ferryman a debt');
  });

  it('Richer re-asks the strong model', async () => {
    const { events: ev } = await ask({ slot: 2, richer: true });
    expect(fake.requests.at(-1)?.role).toBe('strong');
    expect(ev.at(-1)).toMatchObject({ type: 'done', say: 'A richer line.', beats: ['deep beat'] });
    expect(ev[0]).toMatchObject({ richer: true });
  });

  it('edited names, instructions and order reach the prompt; Reset restores them', async () => {
    const edited = [...DEFAULT_QUICK_SLOTS]
      .reverse()
      .map((s) =>
        s.id === 'twist' ? { ...s, label: 'Chaos', instruction: 'Set something on fire' } : s,
      );
    const put = await app.inject({
      method: 'PUT',
      url: '/api/gm/ai/quick/settings',
      headers: gm,
      payload: { slots: edited },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().slots[0]).toMatchObject({ id: 'twist', label: 'Chaos' });
    const { events: ev } = await ask({ slot: 1 });
    expect(ev[0]).toMatchObject({ slot: { id: 'twist', label: 'Chaos' } });
    expect(lastPrompt()).toContain('Button: Chaos');
    expect(lastPrompt()).toContain('Instruction: Set something on fire');

    const reset = await app.inject({
      method: 'DELETE',
      url: '/api/gm/ai/quick/settings',
      headers: gm,
    });
    expect(reset.json().slots).toEqual(DEFAULT_QUICK_SLOTS);
  });

  it('refuses settings that drop, repeat or blank a slot', async () => {
    const bad = [
      DEFAULT_QUICK_SLOTS.slice(0, 4),
      [...DEFAULT_QUICK_SLOTS.slice(0, 4), DEFAULT_QUICK_SLOTS[0]],
      DEFAULT_QUICK_SLOTS.map((s, i) => (i === 2 ? { ...s, label: '  ' } : s)),
      DEFAULT_QUICK_SLOTS.map((s, i) => (i === 2 ? { ...s, extra: 1 } : s)),
    ];
    for (const slots of bad) {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/gm/ai/quick/settings',
        headers: gm,
        payload: { slots },
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it('with nothing heard and nothing typed, says what to do; a bad slot is refused', async () => {
    writeTranscript([]);
    const none = await ask({ slot: 1 });
    expect(none.res.statusCode).toBe(400);
    expect(none.res.json().error).toMatch(/type one/u);
    expect((await ask({ slot: 6 })).res.statusCode).toBe(400);
    expect((await ask({ slot: 1, target: 'x', extra: true })).res.statusCode).toBe(400);
  });

  it('an unusable answer is an error event, not a blank line', async () => {
    const edited = DEFAULT_QUICK_SLOTS.map((s, i) => (i === 0 ? { ...s, label: 'Broken' } : s));
    await app.inject({
      method: 'PUT',
      url: '/api/gm/ai/quick/settings',
      headers: gm,
      payload: { slots: edited },
    });
    const { events: ev } = await ask({ slot: 1 });
    expect(ev.at(-1)).toMatchObject({ type: 'error', error: 'The co-DM answered nothing usable' });
  });

  it('a GM who presses again or leaves stops the call in flight (review M3)', async () => {
    const edited = DEFAULT_QUICK_SLOTS.map((s, i) => (i === 0 ? { ...s, label: 'Slow' } : s));
    await app.inject({
      method: 'PUT',
      url: '/api/gm/ai/quick/settings',
      headers: gm,
      payload: { slots: edited },
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const port = (app.server.address() as AddressInfo).port;
    const before = fake.requests.length;
    const leaving = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/api/gm/ai/quick`, {
      method: 'POST',
      headers: { ...gm, 'content-type': 'application/json' },
      body: JSON.stringify({ slot: 1 }),
      signal: leaving.signal,
    });
    const reader = res.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toContain('"type":"start"');
    for (let i = 0; i < 100 && fake.requests.length === before; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    const upstream = fake.requests.at(-1)!;
    expect(upstream.signal?.aborted).toBe(false);
    leaving.abort();
    for (let i = 0; i < 100 && !upstream.signal?.aborted; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(upstream.signal?.aborted).toBe(true);
    app.server.closeAllConnections();
  });

  it('the e2e fake names the button, line, NPC and instruction', () => {
    const text = e2eQuickResponse(
      quickPrompt({
        slot: DEFAULT_QUICK_SLOTS[0]!,
        target: 'Can I?',
        recent: [],
        context: { party: [], region: null, npc: { name: 'Sal', notes: '' }, lore: [] },
      }),
      'strong',
    );
    expect(parseQuick(text)).toMatchObject({
      say: '(richer) Yes, and… to "Can I?"',
      beats: [
        'NPC: Sal',
        `Instruction: ${DEFAULT_QUICK_SLOTS[0]!.instruction}`,
        expect.any(String),
      ],
    });
  });

  // QF.50: shop keepers and NPCs that live only in GM notes are pickable and
  // reach the prompt with their notes and lore. Last in this block: it adds
  // a shop and notes that the earlier tests' exact NPC list does not expect.
  it('a shop keeper and a GM-note NPC are in the picker and the scene (QF.50)', async () => {
    const ctx = {
      actor: { role: 'gm' as const },
      sessionId: null,
      now: () => '2026-10-30T08:00:00.000Z',
      newId: () => `qf50-${++ids}`,
    };
    for (const command of [
      {
        type: 'shop.define',
        shopId: 'resin',
        name: 'The Resin Stall',
        keeper: 'Old Brenna: half-blind, smells of resin, haggles hard.',
      },
      {
        type: 'note.create',
        characterId: null,
        kind: 'gm',
        title: 'Tamsin Reed',
        body: 'Survivor scout, wiry, chews bark.',
        tags: ['npc'],
      },
      {
        type: 'note.create',
        characterId: null,
        kind: 'gm',
        title: 'Brenna',
        body: 'Brenna once sold resin to a pale hunter.',
        tags: ['lore', 'npc:Old Brenna'],
      },
    ]) {
      const r = execute(store.campaign, command as never, ctx);
      if (!r.ok) throw new Error(`${command.type}: ${r.error}`);
      store.appendAll(r.events);
    }
    writeTranscript([
      line('We walk up to Tamsin Reed by the canyon.'),
      line('Is it safe?', 'Jake'),
    ]);
    const res = await app.inject({ method: 'GET', url: '/api/gm/ai/quick', headers: gm });
    const body = res.json() as { npc: string; npcs: { id: string; name: string }[] };
    expect(body.npcs).toEqual(
      expect.arrayContaining([
        { id: 'shop:resin', name: 'Old Brenna' },
        { id: 'npc:tamsin reed', name: 'Tamsin Reed' },
      ]),
    );
    expect(body.npc).toBe('npc:tamsin reed');
    await ask({ slot: 4 });
    expect(lastPrompt()).toContain(
      'NPC in the scene: Tamsin Reed (Survivor scout, wiry, chews bark.)',
    );
    const { events: ev } = await ask({ slot: 4, npc: 'shop:resin' });
    expect(ev[0]).toMatchObject({ npc: { id: 'shop:resin', name: 'Old Brenna' } });
    expect(lastPrompt()).toContain('NPC in the scene: Old Brenna (Keeper of The Resin Stall.');
    expect(lastPrompt()).toContain('- Brenna once sold resin to a pale hunter.');
  });
});

describe('quick-response canary (MD.1)', () => {
  it('no player frame carries a quick response, its quote or the transcript', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'the-system-quick-canary-'));
    writeFileSync(path.join(root, 'index.html'), '<!doctype html>');
    const store = campaign(root);
    mkdirSync(transcriptsDir(store), { recursive: true });
    writeFileSync(
      transcriptFile(transcriptsDir(store), 0),
      JSON.stringify(line('Can I bribe the CANARYGUARD?', 'Jake')) + '\n',
    );
    const coDm = new CoDm({
      dir: path.join(root, 'app-data'),
      cipher: null,
      makeClient: () =>
        new FixtureAiClient([
          { match: 'Quick response.', text: 'SAY: CANARYANSWER takes the coin.\n- CANARYBEAT' },
        ]),
    });
    const app = await createServer({
      webRoot: root,
      live: { store, gmKey: GM, now: () => '2026-10-30T07:00:00.000Z', newId: () => `c${++ids}` },
      coDm,
    });
    try {
      await app.listen({ port: 0, host: '127.0.0.1' });
      const base = `127.0.0.1:${(app.server.address() as AddressInfo).port}`;
      const frames: string[] = [];
      const ws = new WebSocket(`ws://${base}/ws`);
      ws.addEventListener('message', (e) => frames.push(String(e.data)));
      await new Promise((r) => ws.addEventListener('open', r, { once: true }));
      ws.send(JSON.stringify({ type: 'join', role: 'player', characterId: 'jake' }));
      const until = async (test: () => boolean) => {
        for (let i = 0; i < 200 && !test(); i++) await new Promise((r) => setTimeout(r, 10));
      };
      await until(() => frames.some((f) => f.includes('"view"')));
      for (const slot of [1, 2, 3, 4, 5]) {
        const res = await fetch(`http://${base}/api/gm/ai/quick`, {
          method: 'POST',
          headers: { ...gm, 'content-type': 'application/json' },
          body: JSON.stringify({ slot, ...(slot === 3 ? { richer: true } : {}) }),
        });
        expect(await res.text()).toContain('CANARYANSWER');
      }
      // Without the GM key, nothing.
      const refused = await fetch(`http://${base}/api/gm/ai/quick`);
      expect(refused.status).toBe(403);
      await new Promise((r) => setTimeout(r, 100));
      ws.close();
      expect(frames.some((f) => f.includes('"view"'))).toBe(true);
      for (const f of frames) expect(f).not.toContain('CANARY');
    } finally {
      await app.close();
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
