import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveClient } from '../src/live';

/** A minimal WebSocket stand-in: records sent frames, lets the test push server frames. */
class FakeSocket {
  static readonly OPEN = 1;
  static last: FakeSocket | null = null;
  readyState = 1;
  sent: Record<string, unknown>[] = [];
  private readonly handlers = new Map<string, ((e: { data: string }) => void)[]>();
  constructor(readonly url: string) {
    FakeSocket.last = this;
  }
  addEventListener(type: string, fn: (e: { data: string }) => void): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]);
  }
  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  close(): void {
    this.readyState = 3;
  }
  push(message: Record<string, unknown>): void {
    for (const fn of this.handlers.get('message') ?? []) fn({ data: JSON.stringify(message) });
  }
  limitsFrames(): number {
    return this.sent.filter((m) => m.type === 'view.limits').length;
  }
}

const emptyView = { messages: [] } as unknown as Record<string, unknown>;

describe('LiveClient view.limits retry (QF.52)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeSocket);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function joinedClient(): { client: LiveClient; socket: FakeSocket } {
    const client = new LiveClient({ role: 'player', characterId: 'c1' }, 'ws://test');
    const socket = FakeSocket.last!;
    socket.push({ type: 'hello', campaign: 'main' });
    socket.push({ type: 'joined', seq: 1 });
    socket.push({ type: 'view', seq: 1, view: emptyView });
    return { client, socket };
  }

  it('re-sends a rate-limited limits frame', () => {
    const { client, socket } = joinedClient();
    client.viewLimits({ messages: 100 });
    expect(socket.limitsFrames()).toBe(1);
    socket.push({ type: 'error', error: 'Too many actions: slow down' });
    expect(client.current.error).toBeNull();
    vi.advanceTimersByTime(1000);
    expect(socket.limitsFrames()).toBe(2);
    client.close();
  });

  it('re-sends after a rejoin even when the queued view arrives before the rate limit', () => {
    const { client, socket } = joinedClient();
    client.viewLimits({ messages: 100 });
    expect(socket.limitsFrames()).toBe(1);
    // Rejoin: joined re-sends the limits, then the server's default view
    // (already queued) arrives before the limits frame is refused.
    socket.push({ type: 'joined', seq: 2 });
    expect(socket.limitsFrames()).toBe(2);
    socket.push({ type: 'view', seq: 2, view: emptyView });
    socket.push({ type: 'error', error: 'Too many actions: slow down' });
    vi.advanceTimersByTime(1000);
    expect(socket.limitsFrames()).toBe(3);
    client.close();
  });

  it('does not retry a rate limit long after the last limits frame', () => {
    const { client, socket } = joinedClient();
    client.viewLimits({ messages: 100 });
    socket.push({ type: 'view', seq: 2, view: emptyView });
    vi.advanceTimersByTime(5000);
    socket.push({ type: 'error', error: 'Too many actions: slow down' });
    vi.advanceTimersByTime(1000);
    expect(socket.limitsFrames()).toBe(1);
    expect(client.current.error).toMatch(/Too many actions/);
    client.close();
  });
});
