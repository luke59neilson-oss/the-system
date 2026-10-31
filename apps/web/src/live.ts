import { campaignSwitchNotice, missingCharacterReason } from './campaignSwitch';
import {
  DEMO_CHARACTERS,
  type CampaignState,
  type GmChangeNotice,
  type PlayerView,
} from '@the-system/engine';

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
  | { kind: 'profession'; characterId: string; name: string; level: number }
  | { kind: 'freePoints'; characterId: string; unassigned: number }
  | { kind: 'broadcast'; characterId: string; text: string }
  | { kind: 'hiddenQuest'; characterId: string }
  | { kind: 'skillUpgrade'; characterId: string; skill: string; from: string; to: string }
  | {
      kind: 'spellCast';
      characterId: string;
      skill: string;
      pool: string;
      amount: number;
      left: number;
    }
  | { kind: 'mergeOffer'; characterId: string; skills: readonly [string, string]; name: string }
  | {
      kind: 'skillMerge';
      characterId: string;
      skills: readonly [string, string];
      name: string;
      rarity: string;
    }
  | {
      kind: 'gift';
      characterId: string;
      from: string | null;
      currency: number;
      currencyName: string;
      items: { name: string; count: number }[];
      reason?: string;
    }
  | { kind: 'title'; characterId: string; title: string; text: string }
  | {
      kind: 'itemsTaken';
      characterId: string;
      items: { name: string; count: number }[];
      reason: string;
    }
  | {
      kind: 'currency';
      characterId: string;
      amount: number;
      currencyName: string;
      reason: string;
    }
  | {
      kind: 'trade';
      characterId: string;
      action: 'proposed' | 'accepted' | 'declined' | 'cancelled';
      other: string | null;
    }
  /** MU.2: any other change the GM made to this character. */
  | GmChangeNotice;

export interface SeqNotification {
  seq: number;
  /** Time of the causing event (ISO-8601 UTC). */
  at: string;
  /** In-game day after the causing event. */
  day: number;
  notification: LiveNotification;
}

/** QF.52: how long a rate-limited `view.limits` waits before it is sent again. */
const LIMITS_RETRY_MS = 1000;

type ServerMessage =
  | { type: 'hello'; protocol: number; campaign?: string }
  | { type: 'joined'; role: 'gm' | 'player'; characterId: string | null; seq: number }
  | { type: 'view'; seq: number; view: PlayerView }
  | { type: 'state'; seq: number; state: CampaignState | null }
  /** QF.52: the top-level keys of the GM's state that changed. */
  | { type: 'statePatch'; seq: number; set: Partial<CampaignState>; unset?: string[] }
  | { type: 'notifications'; items: SeqNotification[]; reset?: true }
  /** `warning`: the change was saved, but something after it failed (e.g. a session-end backup). */
  | { type: 'result'; requestId: string; ok: true; warning?: string }
  | { type: 'result'; requestId: string; ok: false; error: string }
  | { type: 'listening'; on: boolean }
  | { type: 'error'; error: string };

export type JoinAs =
  | { role: 'gm'; gmKey: string }
  /** `viewAs`: a GM View-as pane (read-only; unshared journal entries left out, M3.10). */
  | { role: 'player'; characterId: string; viewAs?: boolean };

export interface LiveSnapshot {
  status: 'connecting' | 'joined' | 'offline' | 'refused';
  error: string | null;
  seq: number;
  state: CampaignState | null;
  view: PlayerView | null;
  /** Every notification back to day 1 (M3.3), oldest first. */
  notifications: SeqNotification[];
  /**
   * Seq of the first view or state this page received for the campaign:
   * notifications after it arrived while this page was open (queued as
   * DINGs, M3.3); older ones are history. Null until then.
   */
  liveSince: number | null;
  /** Campaign id the server says this connection serves (`demo` for the demo, MS.4). */
  campaign: string | null;
  /** MC.5: the co-DM is listening (DESIGN §11: players see a mark while it is on). */
  listening: boolean;
  /**
   * QF.66: the GM opened another campaign (a restored copy, the demo) while
   * this page was open, so the sheet changed under the player; they are told.
   */
  campaignSwitched: string | null;
}

export type CommandResult = { ok: true; warning?: string } | { ok: false; error: string };

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
    liveSince: null,
    campaign: null,
    listening: false,
    campaignSwitched: null,
  };
  private readonly listeners = new Set<(s: LiveSnapshot) => void>();
  private readonly pending = new Map<string, (r: CommandResult) => void>();
  private nextRequest = 0;
  /** 0 on first join: the server sends the whole history back to day 1 (M3.3). */
  private lastSeq = 0;
  /** QF.52: a `view.limits` frame went out and no view has answered it yet. */
  private limitsPending = false;
  private limitsRetry: ReturnType<typeof setTimeout> | null = null;
  /** QF.52: what this player's view should carry beyond the defaults. */
  private limits: { messages?: number | undefined; openNotes?: readonly string[] | undefined } = {};
  /** The campaign changed since this page last joined (MS.4 demo switch). */
  private campaignChanged = false;
  /** QF.66: the first campaign this page joined, so a switch back reads as one. */
  private homeCampaign: string | null = null;
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

  /**
   * QF.52: a player view carries the newest messages and cut note bodies.
   * Ask for at least `messages` messages, or for these notes whole. Kept and
   * sent again after every (re)join, since a join starts from the defaults.
   */
  viewLimits(limits: { messages?: number; openNotes?: readonly string[] }): void {
    const next = {
      messages: Math.max(this.limits.messages ?? 0, limits.messages ?? 0) || undefined,
      openNotes: limits.openNotes ? [...limits.openNotes].slice(-20) : this.limits.openNotes,
    };
    const same =
      next.messages === this.limits.messages &&
      (next.openNotes ?? []).join('\u0000') === (this.limits.openNotes ?? []).join('\u0000');
    this.limits = next;
    if (!same) this.sendLimits();
  }

  private sendLimits(): void {
    const socket = this.socket;
    if (this.join.role !== 'player' || !socket || socket.readyState !== WebSocket.OPEN) return;
    if (this.snapshot.status !== 'joined') return;
    const { messages, openNotes } = this.limits;
    if (messages === undefined && openNotes === undefined) return;
    this.limitsPending = true;
    socket.send(
      JSON.stringify({
        type: 'view.limits',
        ...(messages !== undefined ? { messages: Math.min(messages, 10_000) } : {}),
        ...(openNotes !== undefined ? { openNotes } : {}),
      }),
    );
  }

  /** QF.66: the player has read the campaign-switch notice. */
  dismissCampaignSwitched(): void {
    this.update({ campaignSwitched: null });
  }

  close(): void {
    this.closed = true;
    if (this.retry) clearTimeout(this.retry);
    if (this.limitsRetry) clearTimeout(this.limitsRetry);
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
        this.homeCampaign ??= campaign;
        if (this.snapshot.campaign !== null && campaign !== this.snapshot.campaign) {
          // The GM switched campaigns (real ↔ demo, MS.4), maybe while we were
          // offline: nothing from the other campaign may carry over.
          this.lastSeq = 0;
          this.campaignChanged = true;
          this.update({
            notifications: [],
            liveSince: null,
            state: null,
            view: null,
            seq: 0,
            campaignSwitched: campaignSwitchNotice(campaign, this.homeCampaign),
          });
        }
        if (campaign !== this.snapshot.campaign) this.update({ campaign });
        const join =
          this.join.role === 'gm'
            ? { type: 'join', role: 'gm', gmKey: this.join.gmKey }
            : {
                type: 'join',
                role: 'player',
                characterId: this.join.characterId,
                ...(this.join.viewAs ? { viewAs: true } : {}),
              };
        socket.send(JSON.stringify({ ...join, lastSeq: this.lastSeq }));
        return;
      }
      case 'joined':
        this.campaignChanged = false;
        // The server says so again after the join if it is still listening.
        this.update({ status: 'joined', error: null, seq: message.seq, listening: false });
        this.sendLimits();
        return;
      case 'state':
        this.lastSeq = message.seq;
        this.update({
          state: message.state,
          seq: message.seq,
          liveSince: this.snapshot.liveSince ?? message.seq,
        });
        return;
      case 'statePatch': {
        // A patch only ever follows a whole `state` on this socket.
        const base = this.snapshot.state;
        if (!base) return;
        this.lastSeq = message.seq;
        const state = { ...base, ...message.set } as Record<string, unknown>;
        for (const key of message.unset ?? []) delete state[key];
        this.update({ state: state as unknown as CampaignState, seq: message.seq });
        return;
      }
      case 'listening':
        this.update({ listening: message.on });
        return;
      case 'view':
        this.limitsPending = false;
        this.lastSeq = message.seq;
        this.update({
          view: message.view,
          seq: message.seq,
          liveSince: this.snapshot.liveSince ?? message.seq,
        });
        return;
      case 'notifications': {
        if (message.reset) {
          // An undo: the server's history replaces ours (undone DINGs vanish).
          for (const n of message.items) this.lastSeq = Math.max(this.lastSeq, n.seq);
          this.update({ notifications: message.items });
          return;
        }
        const known = new Set(this.snapshot.notifications.map(keyOf));
        const fresh = message.items.filter((n) => !known.has(keyOf(n)));
        for (const n of message.items) this.lastSeq = Math.max(this.lastSeq, n.seq);
        if (fresh.length) {
          this.update({ notifications: [...this.snapshot.notifications, ...fresh] });
        }
        return;
      }
      case 'result': {
        const resolve = this.pending.get(message.requestId);
        this.pending.delete(message.requestId);
        resolve?.(
          message.ok
            ? message.warning
              ? { ok: true, warning: message.warning }
              : { ok: true }
            : { ok: false, error: message.error },
        );
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
            error: switched ? missingCharacterReason(this.snapshot.campaign) : message.error,
          });
          socket.close();
        } else if (this.limitsPending && /^Too many actions/.test(message.error)) {
          // QF.52 review: a rate-limited `view.limits` is sent again shortly,
          // so an opened note never stays half-loaded.
          this.limitsPending = false;
          this.limitsRetry ??= setTimeout(() => {
            this.limitsRetry = null;
            this.sendLimits();
          }, LIMITS_RETRY_MS);
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
