import {
  EventRejectedError,
  ProjectionError,
  execute,
  notificationHistory,
  projectForGm,
  projectForPlayer,
  type Actor,
  type Command,
  type DomainEvent,
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

/** QF.3 (D136): far above a person tapping, far below a script flooding the hub. */
export const DEFAULT_RATE_LIMIT: RateLimit = { burst: 30, perSecond: 10 };

export const RATE_LIMITED = 'Too many actions at once; wait a moment and try again';

type Role =
  { role: 'none' } | { role: 'gm' } | { role: 'player'; characterId: string; viewAs: boolean };

export interface Connection {
  receive(raw: string): void;
  close(): void;
}

interface Client {
  role: Role;
  send: (message: ServerMessage) => void;
  /** Messages left in this connection's bucket, and when it was last refilled (ms). */
  tokens: number;
  refilledAt: number;
  /** The last player view sent, serialized: unchanged views are not re-sent (QF.3). */
  lastView: string | null;
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

  constructor(store: CampaignStore, options: HubOptions) {
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
  connect(send: (message: ServerMessage) => void): Connection {
    const client: Client = {
      role: { role: 'none' },
      send,
      tokens: this.rateLimit.burst,
      refilledAt: this.clock(),
      lastView: null,
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
    if (!parsed.ok) return client.send({ type: 'error', error: parsed.error });
    const message = parsed.message;
    if (!this.allow(client)) {
      return client.send(
        message.type === 'join'
          ? { type: 'error', error: RATE_LIMITED }
          : { type: 'result', requestId: message.requestId, ok: false, error: RATE_LIMITED },
      );
    }
    if (message.type === 'join') {
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
      });
    } catch {
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
        this.sendSnapshot(other, { onlyIfChanged: !undo && mine.length === 0 });
      } catch {
        // One failing socket must not stop the others from updating.
      }
    }
  }

  /** The GM projection for a GM, the player projection for a player. */
  private sendSnapshot(client: Client, options: { onlyIfChanged?: boolean } = {}): void {
    const role = client.role;
    if (role.role === 'gm') {
      const state = this.store.campaign.state;
      // The GM never receives journal entries a player has not shared (M1.8).
      client.send({ type: 'state', seq: this.seq, state: state && projectForGm(state) });
      return;
    }
    if (role.role !== 'player') return;
    const state = this.store.campaign.state;
    try {
      if (!state) throw new ProjectionError('No campaign');
      const view = projectForPlayer(state, role.characterId, { viewAs: role.viewAs });
      const serialized = JSON.stringify(view);
      if (options.onlyIfChanged && serialized === client.lastView) return;
      client.lastView = serialized;
      client.send({ type: 'view', seq: this.seq, view });
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
    if (undoneSince) {
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
