import { randomInt } from 'node:crypto';
import {
  EventRejectedError,
  PLAYER_VIEW_LIMITS,
  ProjectionError,
  execute,
  notificationHistory,
  projectForGm,
  projectForPlayer,
  type Actor,
  type CampaignState,
  type Command,
  type DomainEvent,
  type PlayerViewLimits,
} from '@the-system/engine';
import { notificationsFor } from './notify';
import {
  helloMessage,
  parseClientMessage,
  type SeqNotification,
  type ServerMessage,
} from './protocol';
import { gmKeyMatches } from './security';
import type { CampaignStore } from './store';

/**
 * The live hub (ROADMAP M2.2): one per open campaign. Owns who each socket is,
 * runs commands with the engine's authority rules, persists the events, and
 * pushes **filtered** updates: GM sockets get the full state, player sockets
 * only `projectForPlayer` output and their own character's notifications.
 * Raw events never leave the server.
 */

export interface HubOptions {
  readonly gmKey: string;
  /** ISO-8601 UTC clock. */
  readonly now: () => string;
  readonly newId: () => string;
  /** Random source in [0, 1) for loot rolls (M6.2); default crypto-backed. */
  readonly random?: () => number;
  readonly sessionId?: string | null;
  /**
   * Runs after a command's events are saved, before anyone is told (e.g. the
   * session-end backup and report, M4.3). Returns a warning for the acting
   * client, or null. Must not throw.
   */
  readonly afterAppend?: (store: CampaignStore, events: readonly DomainEvent[]) => string | null;
  /**
   * Per-connection message budget for every socket but the GM's (QF.3): a
   * bucket of `burst` messages that refills at `perSecond`. Default
   * {@link DEFAULT_RATE_LIMIT}.
   */
  readonly rateLimit?: RateLimit;
}

export interface RateLimit {
  readonly burst: number;
  readonly perSecond: number;
}

/** A uniform number in [0, 1) from the OS's secure source. */
const cryptoRandom = (): number => randomInt(0x1_0000_0000) / 0x1_0000_0000;

/** QF.3 (D136): far above a person tapping, far below a script flooding the hub. */
export const DEFAULT_RATE_LIMIT: RateLimit = { burst: 30, perSecond: 5 };

export const RATE_LIMITED = 'Too many actions at once; wait a moment and try again';

type Role =
  { role: 'none' } | { role: 'gm' } | { role: 'player'; characterId: string; viewAs: boolean };

export interface Connection {
  receive(raw: string): void;
  close(): void;
}

/**
 * Sends one message. `serialized`, when given, is `JSON.stringify(message)`
 * already made (QF.52: a view is stringified once per send).
 */
export type Send = (message: ServerMessage, serialized?: string) => void;

interface Client {
  role: Role;
  send: Send;
  /** Messages left in this connection's bucket, and when it was last refilled (ms). */
  tokens: number;
  refilledAt: number;
  /** The last player view sent, serialized: unchanged views are not re-sent (QF.3). */
  lastView: string | null;
  /** QF.52: what this player's view carries (more messages, opened notes). */
  limits: PlayerViewLimits;
  /**
   * QF.52: the campaign state this GM socket last got, whole or patched; the
   * next frame carries only the top-level keys that are new objects since.
   * Undefined until the first `state` frame.
   */
  gmSent: CampaignState | null | undefined;
}

export class LiveHub {
  private readonly clients = new Set<Client>();
  /**
   * Every notification back to day 1 (M3.3), derived from the event log on
   * first use, appended live, and rebuilt after an undo so undone events'
   * notifications vanish.
   */
  private historyCache: SeqNotification[] | null = null;
  private readonly store: CampaignStore;
  private readonly options: HubOptions;
  /** MC.5 (DESIGN §11): whether the co-DM is listening; every joined client is told. */
  private listeningOn = false;

  constructor(store: CampaignStore, options: HubOptions) {
    const limit = options.rateLimit;
    if (limit && !(Number.isFinite(limit.burst) && limit.burst >= 2 && limit.perSecond > 0)) {
      // A join must always fit, or a client could never get in.
      throw new Error('rateLimit needs burst >= 2 and perSecond > 0');
    }
    this.store = store;
    this.options = options;
  }

  private get rateLimit(): RateLimit {
    return this.options.rateLimit ?? DEFAULT_RATE_LIMIT;
  }

  private clock(): number {
    const ms = Date.parse(this.options.now());
    return Number.isFinite(ms) ? ms : 0;
  }

  /** Spends one message from a non-GM connection's bucket; false when it is empty. */
  private allow(client: Client): boolean {
    if (client.role.role === 'gm') return true;
    const { burst, perSecond } = this.rateLimit;
    const now = this.clock();
    const elapsed = Math.max(0, now - client.refilledAt) / 1000;
    client.tokens = Math.min(burst, client.tokens + elapsed * perSecond);
    client.refilledAt = now;
    if (client.tokens < 1) return false;
    client.tokens -= 1;
    return true;
  }

  private get history(): SeqNotification[] {
    this.historyCache ??= notificationHistory(this.store.campaign);
    return this.historyCache;
  }

  get seq(): number {
    return this.store.campaign.events.length;
  }

  /** Registers a socket; returns the handlers the transport calls. */
  get listening(): boolean {
    return this.listeningOn;
  }

  /** MC.5: turns the listening mark on or off for every joined client. */
  setListening(on: boolean): void {
    if (on === this.listeningOn) return;
    this.listeningOn = on;
    for (const c of this.clients) {
      if (c.role.role !== 'none') c.send({ type: 'listening', on });
    }
  }

  connect(send: Send): Connection {
    const client: Client = {
      role: { role: 'none' },
      send,
      tokens: this.rateLimit.burst,
      refilledAt: this.clock(),
      lastView: null,
      limits: PLAYER_VIEW_LIMITS,
      gmSent: undefined,
    };
    this.clients.add(client);
    send(helloMessage(this.store.id));
    return {
      receive: (raw) => this.receive(client, raw),
      close: () => this.clients.delete(client),
    };
  }

  private receive(client: Client, raw: string): void {
    const parsed = parseClientMessage(raw);
    if (!parsed.ok) {
      // Garbage costs from the same budget as commands.
      this.allow(client);
      return client.send({ type: 'error', error: parsed.error });
    }
    const message = parsed.message;
    if (!this.allow(client)) {
      return client.send(
        message.type === 'command'
          ? { type: 'result', requestId: message.requestId, ok: false, error: RATE_LIMITED }
          : { type: 'error', error: RATE_LIMITED },
      );
    }
    if (message.type === 'view.limits') {
      // QF.52: only a player view has limits; the GM always gets everything.
      if (client.role.role !== 'player') return;
      client.limits = {
        ...client.limits,
        messages: Math.max(PLAYER_VIEW_LIMITS.messages, message.messages ?? client.limits.messages),
        openNotes: message.openNotes ? [...new Set(message.openNotes)] : client.limits.openNotes,
      };
      this.sendSnapshot(client, { onlyIfChanged: true });
      return;
    }
    if (message.type === 'join') {
      // A (re)join starts from a whole view or state and the default limits.
      client.lastView = null;
      client.gmSent = undefined;
      client.limits = PLAYER_VIEW_LIMITS;
      if (message.role === 'gm') {
        if (!gmKeyMatches(this.options.gmKey, message.gmKey)) {
          client.role = { role: 'none' };
          return client.send({ type: 'error', error: 'GM key rejected' });
        }
        client.role = { role: 'gm' };
      } else {
        const state = this.store.campaign.state;
        if (
          !state ||
          !Object.prototype.hasOwnProperty.call(state.characters, message.characterId)
        ) {
          client.role = { role: 'none' };
          return client.send({ type: 'error', error: 'No such character' });
        }
        client.role = {
          role: 'player',
          characterId: message.characterId,
          viewAs: message.viewAs === true,
        };
      }
      client.send({
        type: 'joined',
        role: client.role.role,
        characterId: client.role.role === 'player' ? client.role.characterId : null,
        seq: this.seq,
      });
      // Missed notifications first, then the view: a client that takes its
      // lastSeq from the view can never skip a notification.
      this.sendMissed(client, message.lastSeq);
      this.sendSnapshot(client);
      if (this.listeningOn) client.send({ type: 'listening', on: true });
      return;
    }
    // Commands.
    const role = client.role;
    if (role.role === 'none') {
      return client.send({
        type: 'result',
        requestId: message.requestId,
        ok: false,
        error: 'Join first',
      });
    }
    if (role.role === 'player' && role.viewAs) {
      return client.send({
        type: 'result',
        requestId: message.requestId,
        ok: false,
        error: 'A View-as pane is read-only',
      });
    }
    const actor: Actor =
      role.role === 'gm' ? { role: 'gm' } : { role: 'player', characterId: role.characterId };
    let command = message.command as unknown as Command;
    if (actor.role === 'player' && command.type === 'note.create') {
      // Note ids are server-generated for players (M3.10): a chosen id could
      // probe for notes they cannot read ("already exists").
      command = { ...command, noteId: undefined };
    }
    const before = this.store.campaign.state;
    const fail = (error: string) =>
      client.send({ type: 'result', requestId: message.requestId, ok: false, error });
    let result: ReturnType<typeof execute>;
    try {
      result = execute(this.store.campaign, command, {
        actor,
        sessionId: this.options.sessionId ?? null,
        now: this.options.now,
        newId: this.options.newId,
        random: this.options.random ?? cryptoRandom,
      });
    } catch (error) {
      // An engine bug, not a refusal (M11.5): leave a trace for the GM's log.
      console.error(`The System: ${command.type} failed:`, error);
      return fail('The command could not be run');
    }
    if (!result.ok) return fail(result.error);
    try {
      this.store.appendAll(result.events);
    } catch (error) {
      return fail(
        error instanceof EventRejectedError ? error.message : 'Could not save the change',
      );
    }
    let warning: string | null;
    try {
      warning = this.options.afterAppend?.(this.store, result.events) ?? null;
    } catch {
      warning = 'The change was saved, but a follow-up step failed';
    }
    client.send({
      type: 'result',
      requestId: message.requestId,
      ok: true,
      ...(warning ? { warning } : {}),
    });
    // Every command is one event (D44): its notifications share that event's seq.
    const event = result.events[result.events.length - 1];
    const after = this.store.campaign.state;
    const fresh: SeqNotification[] = notificationsFor(before, after, event).map((notification) => ({
      seq: this.seq,
      at: event?.timestamp ?? this.options.now(),
      day: after?.day ?? 1,
      notification,
    }));
    if (event?.type === 'event.undone') {
      // Rebuild: the undone event's notifications must vanish from the history.
      this.historyCache = null;
    } else if (this.historyCache) {
      this.historyCache.push(...fresh);
    }
    const undo = event?.type === 'event.undone';
    for (const other of this.clients) {
      if (other.role.role === 'none') continue;
      try {
        if (undo) {
          // The undone event's DINGs leave every open history too.
          other.send({
            type: 'notifications',
            items: this.filter(other.role, this.history),
            reset: true,
          });
        }
        const mine = undo ? [] : this.filter(other.role, fresh);
        if (mine.length) other.send({ type: 'notifications', items: mine });
        // A player whose view did not change and who got no notification
        // needs no new snapshot (QF.3): one player's edits must not push
        // every other client's whole view again.
        this.sendSnapshot(other, {
          // QF.52: the GM always gets a patch of what changed.
          onlyIfChanged: other.role.role === 'gm' || (!undo && mine.length === 0),
        });
      } catch {
        // One failing socket must not stop the others from updating.
      }
    }
  }

  /**
   * The GM projection for a GM, the player projection for a player. With
   * `onlyIfChanged`, a player whose view is unchanged gets nothing, and a GM
   * gets only the top-level keys that changed (QF.52).
   */
  private sendSnapshot(client: Client, options: { onlyIfChanged?: boolean } = {}): void {
    const role = client.role;
    if (role.role === 'gm') {
      const state = this.store.campaign.state;
      const base = client.gmSent;
      client.gmSent = state;
      if (!options.onlyIfChanged || !state || !base) {
        // The GM never receives journal entries a player has not shared (M1.8).
        client.send({ type: 'state', seq: this.seq, state: state && projectForGm(state) });
        return;
      }
      const patch = gmPatch(base, state);
      if (patch) client.send({ type: 'statePatch', seq: this.seq, ...patch });
      return;
    }
    if (role.role !== 'player') return;
    const state = this.store.campaign.state;
    try {
      if (!state) throw new ProjectionError('No campaign');
      const view = projectForPlayer(state, role.characterId, {
        viewAs: role.viewAs,
        limits: client.limits,
      });
      const serialized = JSON.stringify(view);
      if (options.onlyIfChanged && serialized === client.lastView) return;
      client.lastView = serialized;
      const seq = this.seq;
      client.send({ type: 'view', seq, view }, `{"type":"view","seq":${seq},"view":${serialized}}`);
    } catch (error) {
      if (!(error instanceof ProjectionError)) throw error;
      // The character is gone (e.g. its creation was undone): back to the join screen.
      client.role = { role: 'none' };
      client.lastView = null;
      client.send({ type: 'error', error: 'Your character no longer exists' });
    }
  }

  private filter(role: Role, items: readonly SeqNotification[]): SeqNotification[] {
    if (role.role === 'gm') return [...items];
    if (role.role !== 'player') return [];
    return items.filter((n) => n.notification.characterId === role.characterId);
  }

  /**
   * Sends the notifications after `lastSeq`: the whole history on a first
   * join (`lastSeq` 0), the missed ones on a reconnect. The history comes
   * from the event log, so it never has gaps (restarts included).
   */
  private sendMissed(client: Client, lastSeq: number | undefined): void {
    if (lastSeq === undefined || client.role.role === 'none') return;
    // An undo since lastSeq (e.g. while this player was offline) may have
    // removed DINGs the client still holds: send the whole history to replace them.
    const undoneSince =
      lastSeq > 0 &&
      this.store.campaign.events.slice(lastSeq).some((e) => e.type === 'event.undone');
    // A client ahead of the log (M11.2): the server came back with fewer events
    // than it had acknowledged (a disk that lost writes), so the client may hold
    // notifications that no longer exist. Replace its whole history too.
    const aheadOfLog = lastSeq > this.seq;
    if (undoneSince || aheadOfLog) {
      client.send({
        type: 'notifications',
        items: this.filter(client.role, this.history),
        reset: true,
      });
      return;
    }
    const items = this.filter(
      client.role,
      this.history.filter((n) => n.seq > lastSeq),
    );
    client.send({ type: 'notifications', items });
  }
}

/** Keys the GM projection filters (M1.8): they change together. */
const GM_FILTERED_KEYS: readonly string[] = ['notes', 'noteOrder'];

/**
 * QF.52 (D292): the top-level keys of `state` that are new objects since
 * `base`, projected for the GM, or null when nothing changed. Events never
 * edit a state in place (canary: engine `statePatches.test.ts`), so an
 * unchanged reference is an unchanged value.
 */
export function gmPatch(
  base: CampaignState,
  state: CampaignState,
): { set: Partial<CampaignState>; unset?: string[] } | null {
  const before = base as unknown as Record<string, unknown>;
  const after = state as unknown as Record<string, unknown>;
  const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
  const changed = Object.keys(after).filter((k) => !has(before, k) || before[k] !== after[k]);
  const unset = Object.keys(before).filter((k) => !has(after, k));
  if (changed.length === 0 && unset.length === 0) return null;
  const set: Record<string, unknown> = {};
  let projected: Record<string, unknown> | null = null;
  for (const key of changed) {
    if (GM_FILTERED_KEYS.includes(key)) {
      projected ??= projectForGm(state) as unknown as Record<string, unknown>;
      for (const k of GM_FILTERED_KEYS) set[k] = projected[k];
    } else {
      set[key] = after[key];
    }
  }
  return { set: set as Partial<CampaignState>, ...(unset.length ? { unset } : {}) };
}
