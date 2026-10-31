import { z } from 'zod';
import {
  ENGINE_API_VERSION,
  type CampaignState,
  type HistoryItem,
  type PlayerView,
} from '@the-system/engine';

/** Live protocol version; bumped on incompatible message changes. */
/** v4 (QF.52): `statePatch` frames for the GM; `view.limits` from players. */
export const PROTOCOL_VERSION = 4;

/** First frame the server sends on every WebSocket connection. */
export interface HelloMessage {
  type: 'hello';
  protocol: number;
  server: 'the-system';
  engineApiVersion: number;
  /**
   * Which campaign this connection serves (MS.4: the real one or the demo).
   * Clients reset what they hold when it changes. Omitted without a campaign.
   */
  campaign?: string;
}

export function helloMessage(campaign?: string): HelloMessage {
  return {
    type: 'hello',
    protocol: PROTOCOL_VERSION,
    server: 'the-system',
    engineApiVersion: ENGINE_API_VERSION,
    ...(campaign === undefined ? {} : { campaign }),
  };
}

const seq = z.number().int().nonnegative();

/** QF.52: the most messages a player can ask one view to carry. */
export const MAX_VIEW_MESSAGES = 10_000;
/** QF.52: the most notes a player view sends whole at once. */
export const MAX_OPEN_NOTES = 20;

/** Messages a client may send. Anything else is refused. */
export const clientMessageSchema = z.union([
  z.strictObject({
    type: z.literal('join'),
    role: z.literal('player'),
    characterId: z.string().min(1).max(100),
    /**
     * The GM's View-as panes (M3.10): read-only, and the player's unshared
     * journal entries are left out, as for the GM.
     */
    viewAs: z.boolean().optional(),
    /** Last notification seq this client saw; later ones are sent (0 = the whole history, M3.3). */
    lastSeq: seq.optional(),
  }),
  z.strictObject({
    type: z.literal('join'),
    role: z.literal('gm'),
    gmKey: z.string().min(1).max(1000),
    lastSeq: seq.optional(),
  }),
  /**
   * QF.52: a player view carries the newest messages and cut note bodies;
   * the player asks for more messages or opens notes (full bodies). Every
   * field is within what that player may already read.
   */
  z.strictObject({
    type: z.literal('view.limits'),
    messages: z.number().int().min(0).max(MAX_VIEW_MESSAGES).optional(),
    openNotes: z.array(z.string().min(1).max(100)).max(MAX_OPEN_NOTES).optional(),
  }),
  z.strictObject({
    type: z.literal('command'),
    requestId: z.string().min(1).max(100),
    command: z.looseObject({ type: z.string() }),
  }),
]);
export type ClientMessage = z.output<typeof clientMessageSchema>;

/** A notification with its seq, time and in-game day (v3: `at` and `day`). */
export type SeqNotification = HistoryItem;

/** Messages the server sends after hello. Player sockets get only projected data. */
export type ServerMessage =
  | HelloMessage
  | { type: 'joined'; role: 'gm' | 'player'; characterId: string | null; seq: number }
  | { type: 'view'; seq: number; view: PlayerView }
  | { type: 'state'; seq: number; state: CampaignState | null }
  /**
   * QF.52: the top-level state keys that changed since the last `state` or
   * `statePatch` this GM socket got; `unset` keys are gone.
   */
  | {
      type: 'statePatch';
      seq: number;
      set: Partial<CampaignState>;
      unset?: readonly string[];
    }
  | {
      /** The history is derived from the event log, so it always reaches back to day 1. */
      type: 'notifications';
      items: readonly SeqNotification[];
      /** After an undo: `items` is the whole history and replaces what the client holds. */
      reset?: true;
    }
  /** `warning`: the change was saved, but something after it failed (e.g. a session-end backup). */
  | { type: 'result'; requestId: string; ok: true; warning?: string }
  | { type: 'result'; requestId: string; ok: false; error: string }
  /** MC.5: the co-DM is listening (players see "the System is listening"). */
  | { type: 'listening'; on: boolean }
  | { type: 'error'; error: string };

/** Parses one client frame; returns an error string instead of throwing. */
export function parseClientMessage(
  raw: string,
): { ok: true; message: ClientMessage } | { ok: false; error: string } {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Message is not valid JSON' };
  }
  const parsed = clientMessageSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: 'Message has an unknown shape' };
  return { ok: true, message: parsed.data };
}
