// MC.7: GM-only practice-draft routes (under /api/gm/, behind the GM key).
// Drafting reads the current session's transcript file from where it last
// stopped, asks the fast model, and keeps the drafts in the campaign folder.
// Confirming is the GM's own `practice.log` from the review; these routes
// never change the campaign.
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { AiError, type AiClient } from './client';
import { DraftStore, draftPractice, type DraftCharacter, type LoggedUse } from './practiceDrafts';
import type { CampaignStore } from '../store';
import { transcriptsDir } from '../speech/routes';
import { transcriptFile, type TranscriptLine } from '../speech/transcript';
import { transcriptChunks } from './transcriptChunks';

export const draftsDir = (store: CampaignStore) => path.join(store.dir, 'codm');

/** The transcript lines saved for one session (a damaged line is skipped). */
export function readTranscript(store: CampaignStore, session: number): TranscriptLine[] {
  const file = transcriptFile(transcriptsDir(store), session);
  if (!existsSync(file)) return [];
  const out: TranscriptLine[] = [];
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    if (raw.trim() === '') continue;
    try {
      const line = JSON.parse(raw) as TranscriptLine;
      if (typeof line.text === 'string' && typeof line.at === 'string') out.push(line);
    } catch {
      // A torn last line (the laptop lost power mid-write): skip it.
    }
  }
  return out;
}

export function registerPracticeDraftRoutes(
  app: FastifyInstance,
  options: { active: () => { store: CampaignStore } | null; client: AiClient },
): void {
  const fail = (err: unknown) =>
    err instanceof AiError ? err.message : 'Could not read or save the practice drafts';

  app.get('/api/gm/ai/practice-drafts', (_request, reply) => {
    const a = options.active();
    if (!a) return reply.code(404).send({ error: 'No campaign open' });
    try {
      return { drafts: new DraftStore(draftsDir(a.store)).list() };
    } catch (err) {
      return reply.code(500).send({ error: fail(err) });
    }
  });

  let running = false;
  app.post('/api/gm/ai/practice-drafts', async (_request, reply) => {
    const a = options.active();
    const state = a?.store.campaign.state;
    if (!a || !state) return reply.code(404).send({ error: 'No campaign open' });
    if (running) return reply.code(409).send({ error: 'Already drafting' });
    running = true;
    try {
      const store = new DraftStore(draftsDir(a.store));
      // The running session, else the one that just ended, so the GM can
      // draft from the end-of-session review (MC.7 review round 2).
      const target =
        state.currentSession !== null
          ? state.sessions.find((x) => x.id === state.currentSession)
          : state.sessions.at(-1);
      const sessionId = target?.id ?? null;
      const session = target?.number ?? 0;
      const all = readTranscript(a.store, session);
      const from = store.readUpTo(session);
      const characters: DraftCharacter[] = state.characterOrder
        .filter((id) => Object.hasOwn(state.characters, id))
        .map((id) => {
          const c = state.characters[id]!;
          return { id: c.id, name: c.name, skills: c.skills.map((s) => s.name) };
        });
      // Uses logged in the app this session already count (app action first):
      // the GM's entries and a player's own Cast, which is the app action
      // itself (QF.48), never drafted again from the talk around it.
      let logged: LoggedUse[] = state.practice
        .filter((p) => p.sessionId === sessionId && (p.source === 'gm' || p.tags.includes('cast')))
        .map((p) => ({ characterId: p.characterId, skills: p.skills, at: p.at }))
        // A draft still waiting for the GM is not drafted twice (MC.7 review M3),
        // but only this session's: marks are one per skill per session, so a
        // draft left over from an earlier session blocks nothing now (QF.33).
        .concat(
          store
            .list()
            .filter((d) => d.sessionId === sessionId)
            .map((d) => ({ characterId: d.characterId, skills: [d.skill], at: d.at })),
        );
      // QF.49: one bounded piece of talk per request; the read position is
      // saved after each, so a failure later keeps what was already drafted
      // and a retry re-sends only the unread rest.
      let added = 0;
      for (const chunk of transcriptChunks(all, from)) {
        const drafts = await draftPractice(
          options.client,
          all.slice(chunk.start, chunk.end),
          characters,
          logged,
          randomUUID,
          sessionId,
        );
        store.add(session, chunk.end, drafts);
        added += drafts.length;
        // One draft per character and skill across the whole stretch.
        logged = logged.concat(
          drafts.map((d) => ({ characterId: d.characterId, skills: [d.skill], at: d.at })),
        );
      }
      return { drafts: store.list(), added, read: Math.max(0, all.length - from) };
    } catch (err) {
      return reply.code(err instanceof AiError ? 502 : 500).send({ error: fail(err) });
    } finally {
      running = false;
    }
  });

  app.delete<{ Params: { id: string } }>('/api/gm/ai/practice-drafts/:id', (request, reply) => {
    const a = options.active();
    if (!a) return reply.code(404).send({ error: 'No campaign open' });
    try {
      const store = new DraftStore(draftsDir(a.store));
      if (!store.remove(request.params.id)) return reply.code(404).send({ error: 'No such draft' });
      return { drafts: store.list() };
    } catch (err) {
      return reply.code(500).send({ error: fail(err) });
    }
  });
}
