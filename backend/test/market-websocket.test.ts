import { once } from 'node:events';
import { createServer, type Server } from 'node:http';

import pino from 'pino';
import WebSocket, { type RawData } from 'ws';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MarketWebSocketService,
  type ReplayEngineContract,
} from '../src/market-websocket.js';
import type { MarketReplaySummary } from '../src/replay/market-replay.js';
import type { MarketRowState } from '../src/replay/quote-state.js';
import type { ServerMessage } from '../src/websocket-protocol.js';

const logger = pino({ enabled: false });
const servers: Server[] = [];
const services: MarketWebSocketService[] = [];
const clients: WebSocket[] = [];

const replaySummary: MarketReplaySummary = {
  cash: { linesRead: 1, matchedRows: 1, batches: 1, maximumBatchSize: 1 },
  future: { linesRead: 1, matchedRows: 1, batches: 1, maximumBatchSize: 1 },
};

afterEach(async () => {
  for (const client of clients.splice(0)) client.terminate();
  await Promise.all(services.splice(0).map((service) => service.close()));
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
});

class FakeReplayEngine implements ReplayEngineContract {
  readonly #rows = new Map<string, MarketRowState>();
  readonly #onRowsChanged: (rows: readonly MarketRowState[]) => void;
  readonly run = vi.fn(async () => await this.#completion);
  readonly stop = vi.fn(() => Promise.resolve());
  readonly #completion: Promise<MarketReplaySummary>;
  #resolve!: (summary: MarketReplaySummary) => void;
  #reject!: (error: Error) => void;

  public constructor(
    rows: readonly MarketRowState[],
    onRowsChanged: (rows: readonly MarketRowState[]) => void,
  ) {
    for (const row of rows) this.#rows.set(row.symbol, row);
    this.#onRowsChanged = onRowsChanged;
    this.#completion = new Promise((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject = reject;
    });
  }

  public snapshot(): readonly MarketRowState[] {
    return [...this.#rows.values()];
  }

  public emit(rows: readonly MarketRowState[]): void {
    for (const row of rows) this.#rows.set(row.symbol, row);
    this.#onRowsChanged(rows);
  }

  public complete(): void {
    this.#resolve(replaySummary);
  }

  public fail(error: Error): void {
    this.#reject(error);
  }
}

function emptyRows(): MarketRowState[] {
  return Array.from({ length: 228 }, (_, index) => ({
    symbol: `SYMBOL${String(index).padStart(3, '0')}`,
    stockLtpPaise: null,
    futureLtpPaise: null,
    buySpreadPaise: null,
    sellSpreadPaise: null,
  }));
}

async function startService(publicationIntervalMs = 25): Promise<{
  url: string;
  engine: FakeReplayEngine;
}> {
  const server = createServer();
  servers.push(server);
  let engine: FakeReplayEngine | undefined;
  const service = new MarketWebSocketService({
    server,
    path: '/ws',
    logger,
    publicationIntervalMs,
    createReplayEngine: (onRowsChanged) => {
      engine = new FakeReplayEngine(emptyRows(), onRowsChanged);
      return engine;
    },
  });
  services.push(service);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string' || engine === undefined) {
    throw new Error('test WebSocket server did not start');
  }
  return { url: `ws://127.0.0.1:${String(address.port)}/ws`, engine };
}

async function connect(url: string): Promise<{
  socket: WebSocket;
  messages: ServerMessage[];
}> {
  const socket = new WebSocket(url);
  clients.push(socket);
  const messages: ServerMessage[] = [];
  socket.on('message', (data: RawData) => {
    messages.push(JSON.parse(rawDataToString(data)) as ServerMessage);
  });
  socket.on('error', () => undefined);
  await once(socket, 'open');
  return { socket, messages };
}

function rawDataToString(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return data.toString('utf8');
}

async function waitForMessage(
  messages: readonly ServerMessage[],
  predicate: (message: ServerMessage) => boolean,
): Promise<ServerMessage> {
  const timeoutAt = Date.now() + 2_000;
  while (Date.now() < timeoutAt) {
    const message = messages.find(predicate);
    if (message !== undefined) return message;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('timed out waiting for WebSocket message');
}

describe('MarketWebSocketService', () => {
  it('starts one replay, publishes sequenced deltas, flushes, and retains final state', async () => {
    const { url, engine } = await startService();
    const first = await connect(url);

    await waitForMessage(
      first.messages,
      (message) => message.type === 'status' && message.status === 'running',
    );
    expect(first.messages[0]).toMatchObject({
      type: 'snapshot',
      version: 1,
      sequence: 0,
    });
    expect(
      first.messages[0]?.type === 'snapshot'
        ? first.messages[0].rows
        : undefined,
    ).toHaveLength(228);
    expect(first.messages[1]).toMatchObject({
      type: 'status',
      status: 'waiting',
      sequence: 0,
    });
    expect(engine.run).toHaveBeenCalledOnce();

    const second = await connect(url);
    await waitForMessage(
      second.messages,
      (message) => message.type === 'status' && message.status === 'running',
    );
    expect(second.messages[0]).toMatchObject({
      type: 'snapshot',
      sequence: 0,
    });
    expect(engine.run).toHaveBeenCalledOnce();

    engine.emit([
      {
        symbol: 'SYMBOL000',
        stockLtpPaise: 10_000,
        futureLtpPaise: null,
        buySpreadPaise: null,
        sellSpreadPaise: null,
      },
      {
        symbol: 'SYMBOL000',
        stockLtpPaise: 10_050,
        futureLtpPaise: 10_200,
        buySpreadPaise: 150,
        sellSpreadPaise: -175,
      },
    ]);
    const firstDelta = await waitForMessage(
      first.messages,
      (message) => message.type === 'delta' && message.sequence === 1,
    );
    expect(firstDelta).toEqual({
      type: 'delta',
      version: 1,
      sequence: 1,
      rows: [
        {
          symbol: 'SYMBOL000',
          stockLtp: 100.5,
          futureLtp: 102,
          buySpread: 1.5,
          sellSpread: -1.75,
        },
      ],
    });

    engine.emit([
      {
        symbol: 'SYMBOL001',
        stockLtpPaise: 20_000,
        futureLtpPaise: 20_300,
        buySpreadPaise: 300,
        sellSpreadPaise: -325,
      },
    ]);
    engine.complete();
    await waitForMessage(
      first.messages,
      (message) => message.type === 'status' && message.status === 'complete',
    );
    const finalDeltaIndex = first.messages.findIndex(
      (message) => message.type === 'delta' && message.sequence === 2,
    );
    const completeIndex = first.messages.findIndex(
      (message) => message.type === 'status' && message.status === 'complete',
    );
    expect(finalDeltaIndex).toBeGreaterThan(-1);
    expect(completeIndex).toBeGreaterThan(finalDeltaIndex);

    const afterCompletion = await connect(url);
    const retainedSnapshot = await waitForMessage(
      afterCompletion.messages,
      (message) => message.type === 'snapshot' && message.sequence === 2,
    );
    expect(retainedSnapshot).toMatchObject({
      type: 'snapshot',
      sequence: 2,
    });
    expect(
      retainedSnapshot.type === 'snapshot'
        ? retainedSnapshot.rows.find((row) => row.symbol === 'SYMBOL001')
        : undefined,
    ).toMatchObject({ stockLtp: 200, futureLtp: 203 });
    expect(engine.run).toHaveBeenCalledOnce();
  });

  it('flushes pending state and publishes an error status', async () => {
    const { url, engine } = await startService(1_000);
    const client = await connect(url);
    engine.emit([
      {
        symbol: 'SYMBOL000',
        stockLtpPaise: 100,
        futureLtpPaise: null,
        buySpreadPaise: null,
        sellSpreadPaise: null,
      },
    ]);
    engine.fail(new Error('market.csv:42: invalid price'));

    const errorStatus = await waitForMessage(
      client.messages,
      (message) => message.type === 'status' && message.status === 'error',
    );
    expect(errorStatus).toMatchObject({
      sequence: 1,
      error: 'market.csv:42: invalid price',
    });
    expect(
      client.messages.some(
        (message) => message.type === 'delta' && message.sequence === 1,
      ),
    ).toBe(true);
  });
});
