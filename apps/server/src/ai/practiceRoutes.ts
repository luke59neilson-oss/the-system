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
import { sessionNumber, transcriptsDir } from '../speech/routes';
import { transcriptFile, type TranscriptLine } from '../speech/transcript';

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
      const session = sessionNumber(a.store);
      const all = readTranscript(a.store, session);
      const lines = all.slice(store.readUpTo(session));
      const characters: DraftCharacter[] = state.characterOrder
        .filter((id) => Object.hasOwn(state.characters, id))
        .map((id) => {
          const c = state.characters[id]!;
          return { id: c.id, name: c.name, skills: c.skills.map((s) => s.name) };
        });
      // Uses logged in the app this session already count (app action first).
      const logged: LoggedUse[] = state.practice
        .filter((p) => p.sessionId === state.currentSession && p.source === 'gm')
        .map((p) => ({ characterId: p.characterId, skills: p.skills, at: p.at }));
      const drafts = await draftPractice(options.client, lines, characters, logged, randomUUID);
      store.add(session, all.length, drafts);
      return { drafts: store.list(), added: drafts.length, read: lines.length };
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
