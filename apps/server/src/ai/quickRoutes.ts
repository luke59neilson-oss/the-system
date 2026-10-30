// MD.1: GM-only quick-response routes (under /api/gm/, behind the GM key).
// GET reads the five slots, the line the buttons answer and the NPC in the
// scene; POST asks the fast model (or the strong one for Richer) and streams
// the answer back as NDJSON while it is written; PUT and DELETE save or
// reset the GM's names, instructions and order. Nothing here changes the
// campaign, and nothing is sent to players.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import type { CampaignState } from '@the-system/engine';
import { z } from 'zod';
import { AiError, type AiClient, type SpendSnapshot } from './client';
import { readTranscript } from './practiceRoutes';
import {
  DEFAULT_QUICK_SLOTS,
  QUICK_RECENT_LINES,
  QUICK_SYSTEM,
  findTarget,
  loreFor,
  parseQuick,
  quickPrompt,
  quickSlotsSchema,
  sceneNpc,
  type QuickContext,
  type QuickSlot,
} from './quickResponses';
import type { CampaignStore } from '../store';
import { sessionNumber } from '../speech/routes';

export const QUICK_SETTINGS_FILE = 'quick-responses.json';

/** The GM's five slots on this laptop (D256: a GM preference, not campaign data). */
export class QuickSettingsStore {
  private readonly file: string;
  constructor(private readonly dir: string) {
    this.file = path.join(dir, QUICK_SETTINGS_FILE);
  }

  read(): readonly QuickSlot[] {
    if (!existsSync(this.file)) return DEFAULT_QUICK_SLOTS;
    try {
      const parsed = quickSlotsSchema.safeParse(
        (JSON.parse(readFileSync(this.file, 'utf8')) as { slots?: unknown }).slots,
      );
      return parsed.success ? parsed.data : DEFAULT_QUICK_SLOTS;
    } catch {
      return DEFAULT_QUICK_SLOTS;
    }
  }

  write(slots: readonly QuickSlot[]): void {
    mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ slots }, null, 2) + '\n');
    renameSync(tmp, this.file);
  }

  reset(): void {
    this.write(DEFAULT_QUICK_SLOTS);
  }
}

const postSchema = z.strictObject({
  /** 1–5: the slot's position in the GM's order. */
  slot: z.number().int().min(1).max(5),
  /** A clicked transcript line or the typed line; else the newest question or attempt. */
  target: z.string().trim().min(1).max(1000).optional(),
  /** The NPC picker: an entity id, null for none; absent means the one last named. */
  npc: z.string().max(100).nullable().optional(),
  /** Richer: re-ask the strong model. */
  richer: z.boolean().optional(),
});

interface NpcChoice {
  readonly id: string;
  readonly name: string;
}

const npcsOf = (state: CampaignState) =>
  Object.values(state.entities).map((e) => ({
    id: e.id,
    name: e.name,
    names: [e.name, e.label].filter((n, i, all) => n.trim() !== '' && all.indexOf(n) === i),
    notes: e.notes,
  }));

export function registerQuickRoutes(
  app: FastifyInstance,
  options: {
    active: () => { store: CampaignStore } | null;
    client: AiClient;
    dir: string;
    spend: () => SpendSnapshot;
  },
): void {
  const settings = new QuickSettingsStore(options.dir);

  const scene = (store: CampaignStore) => {
    const state = store.campaign.state as CampaignState;
    const all = readTranscript(store, sessionNumber(store));
    const recent = all.slice(-QUICK_RECENT_LINES);
    const npcs = npcsOf(state);
    return { state, recent, npcs, npcId: sceneNpc(recent, npcs), target: findTarget(recent) };
  };

  app.get('/api/gm/ai/quick', (_request, reply) => {
    const a = options.active();
    const slots = settings.read();
    if (!a?.store.campaign.state) return { slots, target: null, npc: null, npcs: [] };
    try {
      const s = scene(a.store);
      const npcs: NpcChoice[] = s.npcs.map((n) => ({ id: n.id, name: n.name }));
      return {
        slots,
        target: s.target ? { text: s.target.text, speaker: s.target.speaker ?? null } : null,
        npc: s.npcId,
        npcs,
      };
    } catch {
      return reply.code(500).send({ error: 'Could not read the transcript' });
    }
  });

  app.put('/api/gm/ai/quick/settings', { bodyLimit: 16_384 }, (request, reply) => {
    const body = z.strictObject({ slots: quickSlotsSchema }).safeParse(request.body);
    if (!body.success) {
      return reply
        .code(400)
        .send({ error: body.error.issues[0]?.message ?? 'Send { slots } with all five' });
    }
    settings.write(body.data.slots);
    return { slots: settings.read() };
  });

  app.delete('/api/gm/ai/quick/settings', () => {
    settings.reset();
    return { slots: settings.read() };
  });

  app.post('/api/gm/ai/quick', (request, reply) => {
    const a = options.active();
    if (!a?.store.campaign.state) return reply.code(404).send({ error: 'No campaign open' });
    const body = postSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Bad quick-response request' });
    const slot = settings.read()[body.data.slot - 1] as QuickSlot;
    const s = scene(a.store);
    const target = body.data.target ?? s.target?.text;
    if (target === undefined) {
      return reply
        .code(400)
        .send({ error: 'Nothing to answer yet: click a transcript line or type one' });
    }
    const npcId = body.data.npc === undefined ? s.npcId : body.data.npc;
    const npc = s.npcs.find((n) => n.id === npcId) ?? null;
    const region =
      s.state.currentRegion === null
        ? null
        : (s.state.regions[s.state.currentRegion]?.name ?? null);
    const context: QuickContext = {
      party: s.state.characterOrder
        .filter((id) => Object.hasOwn(s.state.characters, id))
        .map((id) => s.state.characters[id]!.name),
      region,
      npc: npc ? { name: npc.name, notes: npc.notes } : null,
      // MD.3: kept lore for this NPC and place, newest first (bounded in the prompt).
      lore: loreFor(Object.values(s.state.notes), { npc: npc?.name ?? null, place: region }),
    };

    const out = new PassThrough();
    const send = (event: Record<string, unknown>) => {
      if (!out.writableEnded) out.write(JSON.stringify(event) + '\n');
    };
    const stop = new AbortController();
    let finished = false;
    // The GM pressed another button or closed the console: stop paying for this one.
    reply.raw.on('close', () => {
      if (!finished) stop.abort();
    });
    void reply
      .code(200)
      .header('content-type', 'application/x-ndjson; charset=utf-8')
      .header('cache-control', 'no-store')
      .send(out);
    send({
      type: 'start',
      slot: { id: slot.id, label: slot.label },
      quote: target,
      npc: npc ? { id: npc.id, name: npc.name } : null,
      richer: body.data.richer === true,
    });
    void (async () => {
      try {
        const answer = await options.client.complete({
          role: body.data.richer === true ? 'strong' : 'fast',
          system: QUICK_SYSTEM,
          messages: [
            { role: 'user', content: quickPrompt({ slot, target, recent: s.recent, context }) },
          ],
          maxTokens: body.data.richer === true ? 500 : 300,
          signal: stop.signal,
          onText: (delta) => send({ type: 'text', delta }),
        });
        const parsed = parseQuick(answer.text);
        if (parsed.say === '') throw new AiError('The co-DM answered nothing usable', 'bad-reply');
        send({ type: 'done', ...parsed, spend: options.spend() });
      } catch (err) {
        send({
          type: 'error',
          error: err instanceof AiError ? err.message : 'The co-DM could not answer that',
          spend: options.spend(),
        });
      } finally {
        finished = true;
        out.end();
      }
    })();
    return reply;
  });
}
