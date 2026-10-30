// MC.8: GM-only suggestion routes (under /api/gm/, behind the GM key). A call
// reads the current session's transcript lines heard since the last call
// (at most the last RECENT_LINES), asks the fast model through the co-DM
// client (so the spend counter counts it), and keeps the chips and the
// dismissed ids in the campaign folder. These routes never change the
// campaign: a chip only fills in the MC.2 generate request.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AiError, type AiClient } from './client';
import { draftsDir, readTranscript } from './practiceRoutes';
import { isQuestionOrAttempt } from './quickResponses';
import {
  arrangePicks,
  rowChips,
  SUGGEST_INTERVAL_DEFAULT_S,
  SUGGEST_INTERVAL_MAX_S,
  SUGGEST_INTERVAL_MIN_S,
  suggest,
  suggestDue,
  type SuggestionChip,
} from './suggestions';
import type { CampaignStore } from '../store';
import { sessionNumber } from '../speech/routes';

/** The model reads at most this many of the newest lines per call. */
export const RECENT_LINES = 40;

interface SuggestionFile {
  readonly version: 1;
  readonly chips: SuggestionChip[];
  readonly dismissed: string[];
  /** MD.2: the chip id in each of the five slots (keys 6–0), or null when empty. */
  readonly slots?: (string | null)[];
  /** Transcript lines already read, per session number. */
  readonly readUpTo: Record<string, number>;
  readonly lastCallAt: number | null;
}

/** GM-only chips for one campaign, in `<dir>/suggestions.json`. */
export class SuggestionStore {
  private readonly file: string;
  constructor(private readonly dir: string) {
    this.file = path.join(dir, 'suggestions.json');
  }

  read(): SuggestionFile {
    if (!existsSync(this.file)) {
      return { version: 1, chips: [], dismissed: [], readUpTo: {}, lastCallAt: null };
    }
    // A damaged file throws, so it is never overwritten (as D241).
    const data = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<SuggestionFile> | null;
    if (!data || !Array.isArray(data.chips) || !Array.isArray(data.dismissed)) {
      throw new Error('The suggestions file is damaged; move it aside to start over');
    }
    return {
      version: 1,
      chips: data.chips,
      dismissed: data.dismissed,
      ...(Array.isArray(data.slots) ? { slots: data.slots } : {}),
      readUpTo: data.readUpTo ?? {},
      lastCallAt: typeof data.lastCallAt === 'number' ? data.lastCallAt : null,
    };
  }

  /** Writes the chips arranged into stable slots (MD.2). */
  writeArranged(body: SuggestionFile, chips: readonly SuggestionChip[]): void {
    const row = arrangePicks(body.slots, chips);
    this.write({ ...body, chips: rowChips(row), slots: row.slots.map((c) => c?.id ?? null) });
  }

  write(body: SuggestionFile): void {
    mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(body, null, 2) + '\n');
    renameSync(tmp, this.file);
  }
}

/** What the panel gets: the row of five, the "more" list, and every live chip. */
const view = (f: SuggestionFile) => {
  const row = arrangePicks(f.slots, f.chips);
  return { slots: row.slots, more: row.more, chips: rowChips(row) };
};

const nameOf = (x: unknown): string | null => {
  if (x === null || typeof x !== 'object') return null;
  const o = x as { name?: unknown; title?: unknown };
  return typeof o.name === 'string' ? o.name : typeof o.title === 'string' ? o.title : null;
};

const postSchema = z
  .object({
    manual: z.boolean().optional(),
    intervalS: z.number().int().min(SUGGEST_INTERVAL_MIN_S).max(SUGGEST_INTERVAL_MAX_S).optional(),
  })
  .optional();

export function registerSuggestionRoutes(
  app: FastifyInstance,
  options: {
    active: () => { store: CampaignStore } | null;
    client: AiClient;
    now: () => number;
    /** MD.2: without a key nothing is asked, so polling cannot use up the pace (D258). */
    hasKey?: () => boolean;
  },
): void {
  const fail = (err: unknown) =>
    err instanceof AiError ? err.message : 'Could not read or save the suggestions';

  app.get('/api/gm/ai/suggestions', (_request, reply) => {
    const a = options.active();
    if (!a) return reply.code(404).send({ error: 'No campaign open' });
    try {
      const f = new SuggestionStore(draftsDir(a.store)).read();
      return { ...view(f), lastCallAt: f.lastCallAt };
    } catch (err) {
      return reply.code(500).send({ error: fail(err) });
    }
  });

  let running = false;
  app.post('/api/gm/ai/suggestions', async (request, reply) => {
    const a = options.active();
    const state = a?.store.campaign.state;
    if (!a || !state) return reply.code(404).send({ error: 'No campaign open' });
    const body = postSchema.safeParse(request.body ?? undefined);
    if (!body.success) return reply.code(400).send({ error: 'Bad suggestion request' });
    if (running) return reply.code(409).send({ error: 'Already suggesting' });
    running = true;
    try {
      const store = new SuggestionStore(draftsDir(a.store));
      const f = store.read();
      const session = sessionNumber(a.store);
      const all = readTranscript(a.store, session);
      const fresh = all.slice(f.readUpTo[String(session)] ?? 0);
      const now = options.now();
      const due = suggestDue({
        now,
        lastCallAt: f.lastCallAt,
        intervalS: body.data?.intervalS ?? SUGGEST_INTERVAL_DEFAULT_S,
        newLines: fresh.length,
        manual: body.data?.manual ?? false,
        question: fresh.some((l) => isQuestionOrAttempt(l)),
      });
      if (!due) return { ...view(f), called: false };
      if (options.hasKey && !options.hasKey()) {
        return reply.code(409).send({ ...view(f), called: false, error: 'No API key is set' });
      }
      const party = state.characterOrder
        .filter((id) => Object.hasOwn(state.characters, id))
        .map((id) => state.characters[id]!.name);
      const known = [state.regions, state.quests, state.entities, state.factions]
        .flatMap((r) => Object.values(r as Record<string, unknown>).map(nameOf))
        .filter((n): n is string => n !== null)
        .slice(0, 60);
      const dismissed = new Set(f.dismissed);
      // The pace counts from the call, paid or failed, so a bad reply is not
      // asked again on every poll (MC.8 review M1).
      store.write({ ...f, lastCallAt: now });
      const chips = await suggest(
        options.client,
        fresh.slice(-RECENT_LINES),
        { party, known },
        dismissed,
      );
      // Re-read: a chip dismissed while the call ran stays gone (MC.8 review M2).
      const latest = store.read();
      const gone = new Set(latest.dismissed);
      const fresher = chips.filter((c) => !gone.has(c.id));
      const current = new Set(fresher.map((c) => c.id));
      // New chips first; older live chips keep their slots, and a new chip
      // fills only an empty or dismissed slot (MD.2); the rest wait in "more".
      store.writeArranged(
        {
          ...latest,
          readUpTo: { ...latest.readUpTo, [String(session)]: all.length },
          lastCallAt: now,
        },
        [...fresher, ...latest.chips.filter((c) => !current.has(c.id))],
      );
      return { ...view(store.read()), called: true };
    } catch (err) {
      return reply.code(err instanceof AiError ? 502 : 500).send({ error: fail(err) });
    } finally {
      running = false;
    }
  });

  // Dismiss: the chip goes, and the same idea never comes back (D244).
  app.delete<{ Params: { id: string } }>('/api/gm/ai/suggestions/:id', (request, reply) => {
    const a = options.active();
    if (!a) return reply.code(404).send({ error: 'No campaign open' });
    try {
      const store = new SuggestionStore(draftsDir(a.store));
      const f = store.read();
      const id = request.params.id;
      if (!f.chips.some((c) => c.id === id)) return reply.code(404).send({ error: 'No such chip' });
      // The slot empties and takes the first waiting chip; no other slot moves.
      store.writeArranged(
        { ...f, dismissed: [...new Set([...f.dismissed, id])] },
        f.chips.filter((c) => c.id !== id),
      );
      return view(store.read());
    } catch (err) {
      return reply.code(500).send({ error: fail(err) });
    }
  });
}
