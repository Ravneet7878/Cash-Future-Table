import { describe, expect, it } from 'vitest';

import {
  INITIAL_RECONNECT_DELAY_MS,
  MarketStreamController,
  type SocketLike,
  type TimerScheduler,
} from '../src/market-stream';
import { snapshot } from './fixtures';

class FakeSocket implements SocketLike {
  public onopen: ((event: Event) => unknown) | null = null;
  public onmessage: ((event: MessageEvent<unknown>) => unknown) | null = null;
  public onclose: ((event: CloseEvent) => unknown) | null = null;
  public onerror: ((event: Event) => unknown) | null = null;
  public closed = false;

  public close(): void {
    this.closed = true;
  }
}

class FakeScheduler implements TimerScheduler {
  public pending: { callback: () => void; delay: number } | null = null;

  public set(callback: () => void, delay: number) {
    this.pending = { callback, delay };
    return 1 as unknown as ReturnType<typeof setTimeout>;
  }

  public clear(): void {
    this.pending = null;
  }

  public run(): void {
    const task = this.pending;
    this.pending = null;
    task?.callback();
  }
}

describe('MarketStreamController', () => {
  it('connects, accepts a snapshot, and reconnects with backoff after close', () => {
    const sockets: FakeSocket[] = [];
    const scheduler = new FakeScheduler();
    const controller = new MarketStreamController(
      'ws://localhost/ws',
      () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      scheduler,
    );

    controller.start();
    sockets[0]?.onopen?.(new Event('open'));
    sockets[0]?.onmessage?.(
      new MessageEvent('message', { data: JSON.stringify(snapshot(4)) }),
    );
    expect(controller.getState()).toMatchObject({
      connection: 'connected',
      hasSnapshot: true,
      sequence: 4,
    });

    sockets[0]?.onclose?.(new CloseEvent('close'));
    expect(controller.getState()).toMatchObject({
      connection: 'reconnecting',
      reconnectAttempt: 1,
    });
    expect(scheduler.pending?.delay).toBe(INITIAL_RECONNECT_DELAY_MS);
    scheduler.run();
    expect(sockets).toHaveLength(2);
    controller.stop();
  });

  it('immediately refreshes from a snapshot after a sequence gap', () => {
    const sockets: FakeSocket[] = [];
    const scheduler = new FakeScheduler();
    const controller = new MarketStreamController(
      'ws://localhost/ws',
      () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      scheduler,
    );
    controller.start();
    sockets[0]?.onopen?.(new Event('open'));
    sockets[0]?.onmessage?.(
      new MessageEvent('message', { data: JSON.stringify(snapshot()) }),
    );
    sockets[0]?.onmessage?.(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'delta',
          version: 1,
          sequence: 2,
          rows: [snapshot().rows[0]],
        }),
      }),
    );

    expect(sockets[0]?.closed).toBe(true);
    expect(controller.getState().notice).toContain('Sequence gap');
    expect(scheduler.pending?.delay).toBe(0);
    scheduler.run();
    expect(sockets).toHaveLength(2);
    controller.stop();
  });

  it('reconnects when the server sends malformed data', () => {
    const socket = new FakeSocket();
    const scheduler = new FakeScheduler();
    const controller = new MarketStreamController(
      'ws://localhost/ws',
      () => socket,
      scheduler,
    );
    controller.start();
    socket.onmessage?.(new MessageEvent('message', { data: '{' }));

    expect(controller.getState().notice).toBe('The server sent invalid JSON.');
    expect(socket.closed).toBe(true);
    expect(scheduler.pending?.delay).toBe(0);
    controller.stop();
  });
});
