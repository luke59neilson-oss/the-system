import {
  EventRejectedError,
  ProjectionError,
  execute,
  projectForPlayer,
  type Actor,
  type Command,
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
  /** Notifications kept in memory for reconnects. */
  readonly notificationHistory?: number;
}

type Role = { role: 'none' } | { role: 'gm' } | { role: 'player'; characterId: string };

export interface Connection {
  receive(raw: string): void;
  close(): void;
}

interface Client {
  role: Role;
  send: (message: ServerMessage) => void;
}

export class LiveHub {
  private readonly clients = new Set<Client>();
  private readonly history: SeqNotification[] = [];
  private readonly store: CampaignStore;
  private readonly options: HubOptions;

  constructor(store: CampaignStore, options: HubOptions) {
    this.store = store;
    this.options = options;
  }

  get seq(): number {
    return this.store.campaign.events.length;
  }

  /** Registers a socket; returns the handlers the transport calls. */
  connect(send: (message: ServerMessage) => void): Connection {
    const client: Client = { role: { role: 'none' }, send };
    this.clients.add(client);
    send(helloMessage());
    return {
      receive: (raw) => this.receive(client, raw),
      close: () => this.clients.delete(client),
    };
  }

  private receive(client: Client, raw: string): void {
    const parsed = parseClientMessage(raw);
    if (!parsed.ok) return client.send({ type: 'error', error: parsed.error });
    const message = parsed.message;
    if (message.type === 'join') {
      if (message.role === 'gm') {
        if (!gmKeyMatches(this.options.gmKey, message.gmKey)) {
          client.role = { role: 'none' };
          return client.send({ type: 'error', error: 'GM key rejected' });
        }
        client.role = { role: 'gm' };
      } else {
        const state = this.store.campaign.state;
        if (!state || !Object.prototype.hasOwnProperty.call(state.characters, message.characterId))
          return client.send({ type: 'error', error: 'No such character' });
        client.role = { role: 'player', characterId: message.characterId };
      }
      client.send({
        type: 'joined',
        role: client.role.role,
        characterId: client.role.role === 'player' ? client.role.characterId : null,
        seq: this.seq,
      });
      this.sendSnapshot(client);
      this.sendMissed(client, message.lastSeq);
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
    const actor: Actor =
      role.role === 'gm' ? { role: 'gm' } : { role: 'player', characterId: role.characterId };
    const before = this.store.campaign.state;
    const result = execute(this.store.campaign, message.command as unknown as Command, {
      actor,
      sessionId: this.options.sessionId ?? null,
      now: this.options.now,
      newId: this.options.newId,
    });
    if (!result.ok) {
      return client.send({
        type: 'result',
        requestId: message.requestId,
        ok: false,
        error: result.error,
      });
    }
    try {
      this.store.appendAll(result.events);
    } catch (error) {
      const text =
        error instanceof EventRejectedError ? error.message : 'Could not save the change';
      return client.send({ type: 'result', requestId: message.requestId, ok: false, error: text });
    }
    client.send({ type: 'result', requestId: message.requestId, ok: true });
    const startSeq = this.seq - result.events.length;
    const fresh = notificationsFor(before, this.store.campaign.state).map((notification, i) => ({
      seq: startSeq + 1 + Math.min(i, result.events.length - 1),
      notification,
    }));
    this.history.push(...fresh);
    const cap = this.options.notificationHistory ?? 5000;
    if (this.history.length > cap) this.history.splice(0, this.history.length - cap);
    for (const other of this.clients) {
      if (other.role.role === 'none') continue;
      this.sendSnapshot(other);
      const mine = this.filter(other.role, fresh);
      if (mine.length) other.send({ type: 'notifications', items: mine });
    }
  }

  /** Current state for a GM, the projection for a player. */
  private sendSnapshot(client: Client): void {
    const role = client.role;
    if (role.role === 'gm') {
      client.send({ type: 'state', seq: this.seq, state: this.store.campaign.state });
      return;
    }
    if (role.role !== 'player') return;
    const state = this.store.campaign.state;
    try {
      if (!state) throw new ProjectionError('No campaign');
      client.send({ type: 'view', seq: this.seq, view: projectForPlayer(state, role.characterId) });
    } catch (error) {
      if (!(error instanceof ProjectionError)) throw error;
      // The character is gone (e.g. its creation was undone): back to the join screen.
      client.role = { role: 'none' };
      client.send({ type: 'error', error: 'Your character no longer exists' });
    }
  }

  private filter(role: Role, items: readonly SeqNotification[]): SeqNotification[] {
    if (role.role === 'gm') return [...items];
    if (role.role !== 'player') return [];
    return items.filter((n) => n.notification.characterId === role.characterId);
  }

  /** Resends notifications after `lastSeq` (reconnect without gaps). */
  private sendMissed(client: Client, lastSeq: number | undefined): void {
    if (lastSeq === undefined || client.role.role === 'none') return;
    const missed = this.filter(
      client.role,
      this.history.filter((n) => n.seq > lastSeq),
    );
    if (missed.length) client.send({ type: 'notifications', items: missed });
  }
}
