import { DEMO_CHARACTERS, type CampaignState, type PlayerView } from '@the-system/engine';

/**
 * Browser side of the live protocol (server: apps/server/src/protocol.ts).
 * One WebSocket to this page's own origin; reconnects with the last seq so
 * missed notifications are resent.
 */

export type LiveNotification =
  | {
      kind: 'level';
      characterId: string;
      track: 'class' | 'profession' | 'race';
      name: string;
      from: number;
      to: number;
      freePoints: number;
    }
  | { kind: 'freePoints'; characterId: string; unassigned: number }
  | { kind: 'broadcast'; characterId: string; text: string };

export interface SeqNotification {
  seq: number;
  notification: LiveNotification;
}

type ServerMessage =
  | { type: 'hello'; protocol: number; campaign?: string }
  | { type: 'joined'; role: 'gm' | 'player'; characterId: string | null; seq: number }
  | { type: 'view'; seq: number; view: PlayerView }
  | { type: 'state'; seq: number; state: CampaignState | null }
  | { type: 'notifications'; items: SeqNotification[]; gap: boolean }
  | { type: 'result'; requestId: string; ok: true }
  | { type: 'result'; requestId: string; ok: false; error: string }
  | { type: 'error'; error: string };

export type JoinAs = { role: 'gm'; gmKey: string } | { role: 'player'; characterId: string };

export interface LiveSnapshot {
  status: 'connecting' | 'joined' | 'offline' | 'refused';
  error: string | null;
  seq: number;
  state: CampaignState | null;
  view: PlayerView | null;
  notifications: SeqNotification[];
  /** The server could not resend everything since our last seq (restart or history cap). */
  gap: boolean;
  /** Campaign id the server says this connection serves (`demo` for the demo, MS.4). */
  campaign: string | null;
}

export type CommandResult = { ok: true } | { ok: false; error: string };

const RECONNECT_MS = 1000;
/** While the GM has another campaign open, a player keeps trying to rejoin at this pace. */
const SWITCHED_RETRY_MS = 3000;

export class LiveClient {
  private socket: WebSocket | null = null;
  private snapshot: LiveSnapshot = {
    status: 'connecting',
    error: null,
    seq: 0,
    state: null,
    view: null,
    notifications: [],
    gap: false,
    campaign: null,
  };
  private readonly listeners = new Set<(s: LiveSnapshot) => void>();
  private readonly pending = new Map<string, (r: CommandResult) => void>();
  private nextRequest = 0;
  /** 0 on first join: the server resends this run's notifications, so a fresh page still has its DINGs. */
  private lastSeq = 0;
  /** Joined at least once on this page: only then can a gap mean this page missed something. */
  private everJoined = false;
  private rejoining = false;
  /** The campaign changed since this page last joined (MS.4 demo switch). */
  private campaignChanged = false;
  private closed = false;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private readonly join: JoinAs;
  private readonly url: string;

  constructor(join: JoinAs, url = defaultUrl()) {
    this.join = join;
    this.url = url;
    this.open();
  }

  get current(): LiveSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (s: LiveSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Sends a command; resolves with the server's verdict (never rejects). */
  command(command: { type: string } & Record<string, unknown>): Promise<CommandResult> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN || this.snapshot.status !== 'joined') {
      return Promise.resolve({ ok: false, error: 'Not connected to the System' });
    }
    const requestId = `r${++this.nextRequest}`;
    return new Promise((resolve) => {
      this.pending.set(requestId, resolve);
      socket.send(JSON.stringify({ type: 'command', requestId, command }));
    });
  }

  close(): void {
    this.closed = true;
    if (this.retry) clearTimeout(this.retry);
    this.socket?.close();
  }

  private update(patch: Partial<LiveSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener(this.snapshot);
  }

  private open(): void {
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.addEventListener('message', (event) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }
      this.handle(socket, message);
    });
    socket.addEventListener('close', () => {
      for (const resolve of this.pending.values()) resolve({ ok: false, error: 'Connection lost' });
      this.pending.clear();
      if (this.closed) return;
      if (this.snapshot.status === 'refused') {
        // Our character is in the campaign the GM switched away from: wait for
        // it to come back instead of giving up.
        if (this.campaignChanged) this.retry = setTimeout(() => this.open(), SWITCHED_RETRY_MS);
        return;
      }
      this.update({ status: 'offline' });
      this.retry = setTimeout(() => this.open(), RECONNECT_MS);
    });
  }

  /**
   * True when a refused player's character belongs to the campaign the GM
   * switched away from: either this page saw the switch, or it (re)loaded
   * while the other campaign was open (a built-in demo character on the real
   * campaign, or a real one on the demo).
   */
  private otherCampaignOpen(): boolean {
    if (this.join.role !== 'player') return false;
    if (this.campaignChanged) return true;
    const characterId = this.join.characterId;
    const isDemoCharacter = DEMO_CHARACTERS.some((c) => c.id === characterId);
    return (this.snapshot.campaign === 'demo') !== isDemoCharacter;
  }

  private handle(socket: WebSocket, message: ServerMessage): void {
    switch (message.type) {
      case 'hello': {
        const campaign = message.campaign ?? null;
        if (this.snapshot.campaign !== null && campaign !== this.snapshot.campaign) {
          // The GM switched campaigns (real ↔ demo, MS.4), maybe while we were
          // offline: nothing from the other campaign may carry over.
          this.lastSeq = 0;
          this.everJoined = false;
          this.campaignChanged = true;
          this.update({ notifications: [], gap: false, state: null, view: null, seq: 0 });
        }
        if (campaign !== this.snapshot.campaign) this.update({ campaign });
        const join =
          this.join.role === 'gm'
            ? { type: 'join', role: 'gm', gmKey: this.join.gmKey }
            : { type: 'join', role: 'player', characterId: this.join.characterId };
        this.rejoining = this.everJoined;
        socket.send(JSON.stringify({ ...join, lastSeq: this.lastSeq }));
        return;
      }
      case 'joined':
        this.everJoined = true;
        this.campaignChanged = false;
        this.update({ status: 'joined', error: null, seq: message.seq });
        return;
      case 'state':
        this.lastSeq = message.seq;
        this.update({ state: message.state, seq: message.seq });
        return;
      case 'view':
        this.lastSeq = message.seq;
        this.update({ view: message.view, seq: message.seq });
        return;
      case 'notifications': {
        const known = new Set(this.snapshot.notifications.map(keyOf));
        const fresh = message.items.filter((n) => !known.has(keyOf(n)));
        for (const n of message.items) this.lastSeq = Math.max(this.lastSeq, n.seq);
        // On a first join a gap only means the server started after older events;
        // after a reconnect it means this page really missed notifications.
        const missed = message.gap && this.rejoining;
        if (fresh.length || missed) {
          this.update({
            notifications: [...this.snapshot.notifications, ...fresh],
            gap: this.snapshot.gap || missed,
          });
        }
        return;
      }
      case 'result': {
        const resolve = this.pending.get(message.requestId);
        this.pending.delete(message.requestId);
        resolve?.(message.ok ? { ok: true } : { ok: false, error: message.error });
        return;
      }
      case 'error':
        // The server drops a player whose character was removed (e.g. its creation undone).
        if (
          this.snapshot.status !== 'joined' ||
          message.error === 'Your character no longer exists'
        ) {
          // A refused join (bad key, unknown character) will not fix itself by
          // retrying, unless the GM switched campaigns under us (retried on close).
          const switched = message.error === 'No such character' && this.otherCampaignOpen();
          // Keep retrying only while our character's campaign is away.
          this.campaignChanged = switched;
          this.update({
            status: 'refused',
            error: switched
              ? 'The GM has switched to another campaign. This screen rejoins when they switch back.'
              : message.error,
          });
          socket.close();
        } else {
          this.update({ error: message.error });
        }
        return;
    }
  }
}

function keyOf(n: SeqNotification): string {
  return `${n.seq}:${JSON.stringify(n.notification)}`;
}

function defaultUrl(): string {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${window.location.host}/ws`;
}
