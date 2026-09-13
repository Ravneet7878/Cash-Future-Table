import type { Server } from 'node:http';

import type { Logger } from 'pino';
import WebSocket, { WebSocketServer } from 'ws';

import type { MarketReplaySummary } from './replay/market-replay.js';
import type { MarketRowState } from './replay/quote-state.js';
import {
  WEBSOCKET_PROTOCOL_VERSION,
  type ReplayStatus,
  type ServerMessage,
  toWireMarketRow,
} from './websocket-protocol.js';

export const DELTA_PUBLICATION_INTERVAL_MS = 1_000;

export type ReplayEngineContract = {
  snapshot: () => readonly MarketRowState[];
  run: () => Promise<MarketReplaySummary>;
  stop: () => Promise<void>;
};

export type ReplayEngineFactory = (
  onRowsChanged: (rows: readonly MarketRowState[]) => void,
) => ReplayEngineContract;

export type MarketWebSocketOptions = Readonly<{
  server: Server;
  path: string;
  logger: Logger;
  createReplayEngine: ReplayEngineFactory;
  publicationIntervalMs?: number;
}>;

export class MarketWebSocketService {
  readonly #webSocketServer: WebSocketServer;
  readonly #engine: ReplayEngineContract;
  readonly #logger: Logger;
  readonly #publicationIntervalMs: number;
  readonly #pendingRows = new Map<string, MarketRowState>();
  #status: ReplayStatus = 'waiting';
  #statusError: string | null = null;
  #sequence = 0;
  #started = false;
  #closed = false;
  #publicationTimer: NodeJS.Timeout | undefined;

  public constructor(options: MarketWebSocketOptions) {
    if (
      options.publicationIntervalMs !== undefined &&
      (!Number.isSafeInteger(options.publicationIntervalMs) ||
        options.publicationIntervalMs <= 0)
    ) {
      throw new RangeError('publicationIntervalMs must be a positive integer');
    }

    this.#logger = options.logger;
    this.#publicationIntervalMs =
      options.publicationIntervalMs ?? DELTA_PUBLICATION_INTERVAL_MS;
    this.#engine = options.createReplayEngine((rows) => {
      this.#recordChanges(rows);
    });
    this.#webSocketServer = new WebSocketServer({
      server: options.server,
      path: options.path,
    });
    this.#webSocketServer.on('connection', (socket) => {
      this.#handleConnection(socket);
    });
    this.#webSocketServer.on('error', (error) => {
      this.#logger.error({ err: error }, 'WebSocket server error');
    });
  }

  public async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.#clearPublicationTimer();
    for (const client of this.#webSocketServer.clients) client.terminate();
    await Promise.all([
      this.#engine.stop(),
      new Promise<void>((resolve, reject) => {
        this.#webSocketServer.close((error) => {
          if (error === undefined) resolve();
          else reject(error);
        });
      }),
    ]);
  }

  #handleConnection(socket: WebSocket): void {
    socket.on('error', (error) => {
      this.#logger.warn({ err: error }, 'WebSocket client error');
    });
    this.#send(socket, {
      type: 'snapshot',
      version: WEBSOCKET_PROTOCOL_VERSION,
      sequence: this.#sequence,
      rows: this.#engine.snapshot().map(toWireMarketRow),
    });
    this.#send(socket, this.#statusMessage());

    if (!this.#started) {
      this.#started = true;
      void this.#startReplay();
    }
  }

  async #startReplay(): Promise<void> {
    this.#setStatus('running');
    this.#publicationTimer = setInterval(() => {
      this.#flushChanges();
    }, this.#publicationIntervalMs);
    this.#publicationTimer.unref();

    try {
      const summary = await this.#engine.run();
      if (this.#closed) return;
      this.#flushChanges();
      this.#clearPublicationTimer();
      this.#setStatus('complete');
      this.#logger.info(
        { cash: summary.cash, future: summary.future },
        'market replay complete',
      );
    } catch (error) {
      if (this.#closed) return;
      this.#flushChanges();
      this.#clearPublicationTimer();
      const message =
        error instanceof Error ? error.message : 'unknown replay error';
      this.#setStatus('error', message);
      this.#logger.error({ err: error }, 'market replay failed');
    }
  }

  #recordChanges(rows: readonly MarketRowState[]): void {
    if (this.#closed) return;
    for (const row of rows) this.#pendingRows.set(row.symbol, row);
  }

  #flushChanges(): void {
    if (this.#pendingRows.size === 0) return;
    this.#sequence += 1;
    const message: ServerMessage = {
      type: 'delta',
      version: WEBSOCKET_PROTOCOL_VERSION,
      sequence: this.#sequence,
      rows: [...this.#pendingRows.values()].map(toWireMarketRow),
    };
    this.#pendingRows.clear();
    this.#broadcast(message);
  }

  #setStatus(status: ReplayStatus, error: string | null = null): void {
    this.#status = status;
    this.#statusError = error;
    this.#broadcast(this.#statusMessage());
  }

  #statusMessage(): ServerMessage {
    return {
      type: 'status',
      version: WEBSOCKET_PROTOCOL_VERSION,
      sequence: this.#sequence,
      status: this.#status,
      error: this.#statusError,
    };
  }

  #broadcast(message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const client of this.#webSocketServer.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  }

  #send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  #clearPublicationTimer(): void {
    if (this.#publicationTimer === undefined) return;
    clearInterval(this.#publicationTimer);
    this.#publicationTimer = undefined;
  }
}
