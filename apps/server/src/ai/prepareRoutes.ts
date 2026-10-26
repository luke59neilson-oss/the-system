// MC.10: GM-only prepare-ahead routes (under /api/gm/, behind the GM key).
// Off by default. When on, a look reads the current session's transcript
// lines heard since the last look (newest RECENT_LINES), asks the fast model
// where the table is heading, and if it names somewhere new, has the strong
// model draft content for it. Both calls go through the co-DM client, so the
// spend counter counts them. Drafts live in `codm/prepared.json`; taking one
// hands its file to the GM's Import window, where the usual preview and
// approval apply. Nothing here changes the campaign (D249).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { CampaignState } from '@the-system/engine';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AiError, type AiClient } from './client';
import { buildGenerateRequest, extractJson, GENERATE_TIMEOUT_MS } from './generate';
import { draftsDir, readTranscript } from './practiceRoutes';
import {
  PREPARE_INTERVAL_DEFAULT_S,
  PREPARE_INTERVAL_MAX_S,
  PREPARE_INTERVAL_MIN_S,
  PREPARE_SYSTEM,
  parseHeading,
  prepareDue,
  preparePrompt,
  type PreparedDraft,
} from './prepareAhead';
import { RECENT_LINES } from './suggestionRoutes';
import type { CampaignStore } from '../store';
import { sessionNumber } from '../speech/routes';

interface PreparedFile {
  readonly version: 1;
  readonly enabled: boolean;
  readonly intervalS: number;
  readonly drafts: PreparedDraft[];
  /** Destinations already prepared, taken or dismissed: never drafted again. */
  readonly seen: string[];
  readonly readUpTo: Record<string, number>;
  readonly lastCallAt: number | null;
}

const EMPTY: PreparedFile = {
  version: 1,
  enabled: false,
  intervalS: PREPARE_INTERVAL_DEFAULT_S,
  drafts: [],
  seen: [],
  readUpTo: {},
  lastCallAt: null,
};

/** GM-only prepared drafts for one campaign, in `<dir>/prepared.json`. */
export class PreparedStore {
  private readonly file: string;
  constructor(private readonly dir: string) {
    this.file = path.join(dir, 'prepared.json');
  }

  read(): PreparedFile {
    if (!existsSync(this.file)) return EMPTY;
    // A damaged file throws, so it is never overwritten (as D241).
    const data = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<PreparedFile> | null;
    if (!data || !Array.isArray(data.drafts) || !Array.isArray(data.seen)) {
      throw new Error('The prepared-drafts file is damaged; move it aside to start over');
    }
    return {
      version: 1,
      enabled: data.enabled === true,
      intervalS: typeof data.intervalS === 'number' ? data.intervalS : PREPARE_INTERVAL_DEFAULT_S,
      drafts: data.drafts,
      seen: data.seen,
      readUpTo: data.readUpTo ?? {},
      lastCallAt: typeof data.lastCallAt === 'number' ? data.lastCallAt : null,
    };
  }

  write(body: PreparedFile): void {
    mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(body, null, 2) + '\n');
    renameSync(tmp, this.file);
  }
}

const nameOf = (x: unknown): string | null => {
  if (x === null || typeof x !== 'object') return null;
  const o = x as { name?: unknown; title?: unknown };
  return typeof o.name === 'string' ? o.name : typeof o.title === 'string' ? o.title : null;
};

const contextOf = (state: CampaignState) => ({
  party: state.characterOrder
    .filter((id) => Object.hasOwn(state.characters, id))
    .map((id) => state.characters[id]!.name),
  known: [state.regions, state.quests, state.entities, state.factions]
    .flatMap((r) => Object.values(r as Record<string, unknown>).map(nameOf))
    .filter((n): n is string => n !== null)
    .slice(0, 60),
});

/** What the panel shows: the drafts without their (large) files. */
const view = (f: PreparedFile) => ({
  enabled: f.enabled,
  intervalS: f.intervalS,
  lastCallAt: f.lastCallAt,
  drafts: f.drafts.map(({ id, kind, place, request, quote, at }) => ({
    id,
    kind,
    place,
    request,
    quote,
    at,
  })),
});

const settingsSchema = z.strictObject({
  enabled: z.boolean(),
  intervalS: z.number().int().min(PREPARE_INTERVAL_MIN_S).max(PREPARE_INTERVAL_MAX_S).optional(),
});
const postSchema = z.strictObject({ manual: z.boolean().optional() }).optional();

export function registerPrepareRoutes(
  app: FastifyInstance,
  options: {
    active: () => { store: CampaignStore } | null;
    client: AiClient;
    now: () => number;
    timeoutMs?: number;
  },
): void {
  const fail = (err: unknown) =>
    err instanceof AiError ? err.message : 'Could not read or save the prepared drafts';
  const storeOf = (a: { store: CampaignStore }) => new PreparedStore(draftsDir(a.store));

  app.get('/api/gm/ai/prepared', (_request, reply) => {
    const a = options.active();
    if (!a) return reply.code(404).send({ error: 'No campaign open' });
    try {
      return view(storeOf(a).read());
    } catch (err) {
      return reply.code(500).send({ error: fail(err) });
    }
  });

  app.put('/api/gm/ai/prepared/settings', (request, reply) => {
    const a = options.active();
    if (!a) return reply.code(404).send({ error: 'No campaign open' });
    const body = settingsSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Send { enabled, intervalS? }' });
    try {
      const store = storeOf(a);
      const f = store.read();
      store.write({
        ...f,
        enabled: body.data.enabled,
        intervalS: body.data.intervalS ?? f.intervalS,
      });
      return view(store.read());
    } catch (err) {
      return reply.code(500).send({ error: fail(err) });
    }
  });

  let running = false;
  app.post('/api/gm/ai/prepared', async (request, reply) => {
    const a = options.active();
    const state = a?.store.campaign.state;
    if (!a || !state) return reply.code(404).send({ error: 'No campaign open' });
    const body = postSchema.safeParse(request.body ?? undefined);
    if (!body.success) return reply.code(400).send({ error: 'Bad prepare request' });
    if (running) return reply.code(409).send({ error: 'Already preparing' });
    running = true;
    try {
      const store = storeOf(a);
      const f = store.read();
      const session = sessionNumber(a.store);
      const all = readTranscript(a.store, session);
      const fresh = all.slice(f.readUpTo[String(session)] ?? 0);
      const now = options.now();
      const due = prepareDue({
        enabled: f.enabled,
        waiting: f.drafts.length,
        now,
        lastCallAt: f.lastCallAt,
        intervalS: f.intervalS,
        newLines: fresh.length,
        manual: body.data?.manual ?? false,
      });
      if (!due) return { ...view(f), called: false, prepared: null };
      // The pace counts from the look, paid or failed, so a failing call is
      // never retried on every poll. The lines count as read only once the
      // fast model's reply parses, so a failed look leaves them for the next.
      store.write({ ...f, lastCallAt: now });
      const lines = fresh.slice(-RECENT_LINES);
      const look = await options.client.complete({
        role: 'fast',
        system: PREPARE_SYSTEM,
        messages: [{ role: 'user', content: preparePrompt(lines, contextOf(state)) }],
        maxTokens: 300,
      });
      let heading;
      try {
        heading = parseHeading(look.text, lines, new Set(f.seen));
      } catch {
        throw new AiError(
          'The co-DM gave a reply it could not read; it will look again later',
          'bad-reply',
        );
      }
      const read = store.read();
      store.write({ ...read, readUpTo: { ...read.readUpTo, [String(session)]: all.length } });
      if (!heading) return { ...view(store.read()), called: true, prepared: null };
      const limitMs = options.timeoutMs ?? GENERATE_TIMEOUT_MS;
      const answer = await options.client.complete({
        ...buildGenerateRequest(heading.kind, heading.request, state),
        timeoutMs: limitMs,
      });
      const file = extractJson(answer.text);
      const latest = store.read();
      store.write({
        ...latest,
        drafts: [...latest.drafts, { ...heading, file, at: now }],
        seen: [...new Set([...latest.seen, heading.id])],
      });
      return { ...view(store.read()), called: true, prepared: heading.id };
    } catch (err) {
      return reply.code(err instanceof AiError ? 502 : 500).send({ error: fail(err) });
    } finally {
      running = false;
    }
  });

  // Take: the draft's file goes to the Import window, where the GM previews,
  // edits and approves it like any content file. The draft stays listed (so a
  // refresh or a closed console loses nothing) until the GM dismisses it.
  app.post<{ Params: { id: string } }>('/api/gm/ai/prepared/:id/take', (request, reply) => {
    const a = options.active();
    if (!a) return reply.code(404).send({ error: 'No campaign open' });
    try {
      const store = storeOf(a);
      const f = store.read();
      const draft = f.drafts.find((d) => d.id === request.params.id);
      if (!draft) return reply.code(404).send({ error: 'No such prepared draft' });
      return { file: draft.file, kind: draft.kind, place: draft.place, ...view(f) };
    } catch (err) {
      return reply.code(500).send({ error: fail(err) });
    }
  });

  // Dismiss: the draft goes, and the same destination is not drafted again.
  app.delete<{ Params: { id: string } }>('/api/gm/ai/prepared/:id', (request, reply) => {
    const a = options.active();
    if (!a) return reply.code(404).send({ error: 'No campaign open' });
    try {
      const store = storeOf(a);
      const f = store.read();
      if (!f.drafts.some((d) => d.id === request.params.id)) {
        return reply.code(404).send({ error: 'No such prepared draft' });
      }
      store.write({ ...f, drafts: f.drafts.filter((d) => d.id !== request.params.id) });
      return view(store.read());
    } catch (err) {
      return reply.code(500).send({ error: fail(err) });
    }
  });
}
