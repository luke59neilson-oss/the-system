import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveClient } from '../src/live';

// QF.54: after an undo of the newest event the server sends `undoneSeqs`
// instead of the whole history; the client drops just those notifications.

class FakeSocket {
  static readonly OPEN = 1;
  static last: FakeSocket | null = null;
  readyState = 1;
  private readonly handlers = new Map<string, ((e: { data: string }) => void)[]>();
  constructor(readonly url: string) {
    FakeSocket.last = this;
  }
  addEventListener(type: string, fn: (e: { data: string }) => void): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]);
  }
  send(): void {}
  close(): void {
    this.readyState = 3;
  }
  push(message: Record<string, unknown>): void {
    for (const fn of this.handlers.get('message') ?? []) fn({ data: JSON.stringify(message) });
  }
}

const ding = (seq: number) => ({
  seq,
  at: '2027-01-01T00:00:00.000Z',
  day: 1,
  notification: { kind: 'broadcast', characterId: 'c1', text: `n${seq}` },
});

describe('LiveClient undoneSeqs (QF.54)', () => {
  beforeEach(() => vi.stubGlobal('WebSocket', FakeSocket));
  afterEach(() => vi.unstubAllGlobals());

  it('drops only the undone seqs and keeps the rest in order', () => {
    const client = new LiveClient({ role: 'player', characterId: 'c1' }, 'ws://test');
    const socket = FakeSocket.last!;
    socket.push({ type: 'hello', campaign: 'main' });
    socket.push({ type: 'joined', seq: 3 });
    socket.push({ type: 'notifications', items: [ding(1), ding(2), ding(3)] });
    expect(client.current.notifications.map((n) => n.seq)).toEqual([1, 2, 3]);
    socket.push({ type: 'notifications', items: [], undoneSeqs: [3] });
    expect(client.current.notifications.map((n) => n.seq)).toEqual([1, 2]);
    client.close();
  });
});
