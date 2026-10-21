import { z } from 'zod';
import { ENGINE_API_VERSION, type CampaignState, type PlayerView } from '@the-system/engine';
import type { Notification } from './notify';

/** Live protocol version; bumped on incompatible message changes. */
export const PROTOCOL_VERSION = 2;

/** First frame the server sends on every WebSocket connection. */
export interface HelloMessage {
  type: 'hello';
  protocol: number;
  server: 'the-system';
  engineApiVersion: number;
}

export function helloMessage(): HelloMessage {
  return {
    type: 'hello',
    protocol: PROTOCOL_VERSION,
    server: 'the-system',
    engineApiVersion: ENGINE_API_VERSION,
  };
}

const seq = z.number().int().nonnegative();

/** Messages a client may send. Anything else is refused. */
export const clientMessageSchema = z.union([
  z.strictObject({
    type: z.literal('join'),
    role: z.literal('player'),
    characterId: z.string().min(1).max(100),
    /** Last notification seq this client saw; missed notifications are resent. */
    lastSeq: seq.optional(),
  }),
  z.strictObject({
    type: z.literal('join'),
    role: z.literal('gm'),
    gmKey: z.string().min(1).max(1000),
    lastSeq: seq.optional(),
  }),
  z.strictObject({
    type: z.literal('command'),
    requestId: z.string().min(1).max(100),
    command: z.looseObject({ type: z.string() }),
  }),
]);
export type ClientMessage = z.output<typeof clientMessageSchema>;

export interface SeqNotification {
  readonly seq: number;
  readonly notification: Notification;
}

/** Messages the server sends after hello. Player sockets get only projected data. */
export type ServerMessage =
  | HelloMessage
  | { type: 'joined'; role: 'gm' | 'player'; characterId: string | null; seq: number }
  | { type: 'view'; seq: number; view: PlayerView }
  | { type: 'state'; seq: number; state: CampaignState | null }
  | {
      type: 'notifications';
      items: readonly SeqNotification[];
      /** True when the server could not cover everything after the client's lastSeq. */
      gap: boolean;
    }
  | { type: 'result'; requestId: string; ok: true }
  | { type: 'result'; requestId: string; ok: false; error: string }
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
