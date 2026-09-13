import {
  applyServerMessage,
  createInitialMarketState,
  withConnection,
  withNotice,
  type MarketState,
} from './market-state';
import { parseServerMessage, ProtocolError } from './protocol';

export const INITIAL_RECONNECT_DELAY_MS = 500;
export const MAX_RECONNECT_DELAY_MS = 8_000;

export type SocketLike = {
  onopen: ((event: Event) => unknown) | null;
  onmessage: ((event: MessageEvent<unknown>) => unknown) | null;
  onclose: ((event: CloseEvent) => unknown) | null;
  onerror: ((event: Event) => unknown) | null;
  close: () => void;
};

export type SocketFactory = (url: string) => SocketLike;

export type TimerScheduler = Readonly<{
  set: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clear: (timer: ReturnType<typeof setTimeout>) => void;
}>;

const browserScheduler: TimerScheduler = {
  set: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (timer) => clearTimeout(timer),
};

export class MarketStreamController {
  readonly #url: string;
  readonly #createSocket: SocketFactory;
  readonly #scheduler: TimerScheduler;
  readonly #listeners = new Set<() => void>();
  #state: MarketState = createInitialMarketState();
  #socket: SocketLike | null = null;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  #active = false;
  #attempt = 0;

  public constructor(
    url: string,
    createSocket: SocketFactory = (socketUrl) => new WebSocket(socketUrl),
    scheduler: TimerScheduler = browserScheduler,
  ) {
    this.#url = url;
    this.#createSocket = createSocket;
    this.#scheduler = scheduler;
  }

  public readonly getState = (): MarketState => this.#state;

  public readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  public start(): void {
    if (this.#active) return;
    this.#active = true;
    this.#connect(false);
  }

  public stop(): void {
    this.#active = false;
    this.#clearReconnectTimer();
    const socket = this.#socket;
    this.#socket = null;
    socket?.close();
    this.#commit(withConnection(this.#state, 'offline', this.#attempt));
  }

  #connect(isReconnect: boolean): void {
    if (!this.#active) return;
    this.#clearReconnectTimer();
    this.#commit(
      withConnection(
        this.#state,
        isReconnect ? 'reconnecting' : 'connecting',
        this.#attempt,
      ),
    );

    let socket: SocketLike;
    try {
      socket = this.#createSocket(this.#url);
    } catch {
      this.#commit(
        withNotice(this.#state, 'Unable to open the live market stream.'),
      );
      this.#scheduleReconnect();
      return;
    }
    this.#socket = socket;

    socket.onopen = () => {
      if (socket !== this.#socket || !this.#active) return;
      this.#attempt = 0;
      this.#commit(withConnection(this.#state, 'connected', 0));
    };
    socket.onmessage = (event) => {
      if (socket !== this.#socket || !this.#active) return;
      try {
        const result = applyServerMessage(
          this.#state,
          parseServerMessage(event.data),
        );
        this.#commit(result.state);
        if (result.reconnect) this.#restart(socket);
      } catch (error) {
        const notice =
          error instanceof ProtocolError
            ? error.message
            : 'The live market stream could not be processed.';
        this.#commit(withNotice(this.#state, notice));
        this.#restart(socket);
      }
    };
    socket.onerror = () => {
      if (socket !== this.#socket || !this.#active) return;
      this.#commit(
        withNotice(this.#state, 'The live market connection was interrupted.'),
      );
      socket.close();
    };
    socket.onclose = () => {
      if (socket !== this.#socket) return;
      this.#socket = null;
      if (this.#active) this.#scheduleReconnect();
    };
  }

  #restart(socket: SocketLike): void {
    if (socket !== this.#socket) return;
    this.#socket = null;
    socket.close();
    this.#scheduleReconnect(0);
  }

  #scheduleReconnect(delayOverride?: number): void {
    if (!this.#active || this.#reconnectTimer !== null) return;
    this.#attempt += 1;
    this.#commit(withConnection(this.#state, 'reconnecting', this.#attempt));
    const delay =
      delayOverride ??
      Math.min(
        INITIAL_RECONNECT_DELAY_MS * 2 ** (this.#attempt - 1),
        MAX_RECONNECT_DELAY_MS,
      );
    this.#reconnectTimer = this.#scheduler.set(() => {
      this.#reconnectTimer = null;
      this.#connect(true);
    }, delay);
  }

  #clearReconnectTimer(): void {
    if (this.#reconnectTimer === null) return;
    this.#scheduler.clear(this.#reconnectTimer);
    this.#reconnectTimer = null;
  }

  #commit(state: MarketState): void {
    if (state === this.#state) return;
    this.#state = state;
    for (const listener of this.#listeners) listener();
  }
}
