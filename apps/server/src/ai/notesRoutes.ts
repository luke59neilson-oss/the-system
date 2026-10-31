// MC.9: GM-only session-notes routes (under /api/gm/, behind the GM key).
// Notes are taken from the running session's transcript (else the session
// that just ended) from where they last stopped; the summary is written from
// those notes when the GM asks, usually after End session (D247). Both land
// in the session log and its export via the session log writer.
import type { FastifyInstance } from 'fastify';
import type { CampaignState, SessionRecord } from '@the-system/engine';
import { AiError, type AiClient } from './client';
import { draftsDir, readTranscript } from './practiceRoutes';
import { NotesStore, summarise, takeNotes, type SessionNotesFile } from './sessionNotes';
import { transcriptChunks } from './transcriptChunks';
import type { TranscriptLine } from '../speech/transcript';
import type { CampaignStore } from '../store';

/** The running session, else the last one; null before the first. */
const target = (state: CampaignState): SessionRecord | null =>
  (state.currentSession !== null
    ? state.sessions.find((x) => x.id === state.currentSession)
    : state.sessions.at(-1)) ?? null;

export function registerNotesRoutes(
  app: FastifyInstance,
  options: {
    active: () => { store: CampaignStore } | null;
    client: AiClient;
    /** Rewrites the session log now (so the export carries the change). */
    flush?: (store: CampaignStore) => void;
  },
): void {
  const fail = (err: unknown) =>
    err instanceof AiError ? err.message : 'Could not read or save the session notes';
  let running = false;

  /**
   * QF.49: notes for the unread transcript, one bounded piece per request,
   * saved after each piece. Lines count as read only when notes came back,
   * so a piece with no usable notes stops the catch-up there and is read
   * again next time (D250).
   */
  const catchUp = async (
    notes: NotesStore,
    all: readonly TranscriptLine[],
    session: number,
  ): Promise<SessionNotesFile> => {
    let file = notes.read(session);
    for (const chunk of transcriptChunks(all, file.readUpTo)) {
      const fresh = await takeNotes(options.client, all.slice(chunk.start, chunk.end));
      if (fresh.length === 0) break;
      file = { ...file, readUpTo: chunk.end, notes: [...file.notes, ...fresh] };
      notes.write(session, file);
    }
    return file;
  };

  const withSession = async (
    reply: { code: (n: number) => { send: (b: unknown) => unknown } },
    work: (store: CampaignStore, state: CampaignState, session: SessionRecord) => Promise<unknown>,
  ) => {
    const a = options.active();
    const state = a?.store.campaign.state;
    if (!a || !state) return reply.code(404).send({ error: 'No campaign open' });
    const session = target(state);
    if (!session) return reply.code(409).send({ error: 'No play session yet' });
    if (running) return reply.code(409).send({ error: 'Already writing notes' });
    running = true;
    try {
      const out = await work(a.store, state, session);
      options.flush?.(a.store);
      return out;
    } catch (err) {
      return reply.code(err instanceof AiError ? 502 : 500).send({ error: fail(err) });
    } finally {
      running = false;
    }
  };

  app.get('/api/gm/ai/session-notes', (_request, reply) => {
    const a = options.active();
    const state = a?.store.campaign.state;
    if (!a || !state) return reply.code(404).send({ error: 'No campaign open' });
    const session = target(state);
    if (!session) return { session: null, notes: [], summary: null };
    try {
      const file = new NotesStore(draftsDir(a.store)).read(session.number);
      return { session: session.number, notes: file.notes, summary: file.summary };
    } catch (err) {
      return reply.code(500).send({ error: fail(err) });
    }
  });

  app.post('/api/gm/ai/session-notes', (_request, reply) =>
    withSession(reply, async (store, _state, session) => {
      const notes = new NotesStore(draftsDir(store));
      const before = notes.read(session.number).notes.length;
      const next = await catchUp(notes, readTranscript(store, session.number), session.number);
      return {
        session: session.number,
        notes: next.notes,
        summary: next.summary,
        added: next.notes.length - before,
      };
    }),
  );

  app.post('/api/gm/ai/session-summary', (_request, reply) =>
    withSession(reply, async (store, state, session) => {
      const notes = new NotesStore(draftsDir(store));
      // Catch up on lines heard since the last notes first; saved before the
      // summary call, so a failed summary keeps them (D250).
      const file = await catchUp(notes, readTranscript(store, session.number), session.number);
      if (file.notes.length === 0) {
        throw new AiError('Nothing heard this session to summarise', 'bad-reply');
      }
      const party = state.characterOrder
        .filter((id) => Object.hasOwn(state.characters, id))
        .map((id) => state.characters[id]!.name);
      const summary = await summarise(options.client, file.notes, party);
      notes.write(session.number, { ...file, summary });
      return { session: session.number, notes: file.notes, summary };
    }),
  );
}
