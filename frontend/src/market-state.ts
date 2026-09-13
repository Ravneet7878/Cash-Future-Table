import type { MarketRow, ServerMessage, ReplayStatus } from './protocol';

export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline';

export type MarketChange = Readonly<{
  kind: 'snapshot' | 'delta';
  rows: readonly MarketRow[];
  sequence: number;
}>;

export type MarketState = Readonly<{
  connection: ConnectionStatus;
  replay: ReplayStatus;
  rows: ReadonlyMap<string, MarketRow>;
  sequence: number;
  hasSnapshot: boolean;
  reconnectAttempt: number;
  notice: string | null;
  updatedAt: number | null;
  lastChange: MarketChange | null;
}>;

export type MessageResult = Readonly<{
  state: MarketState;
  reconnect: boolean;
}>;

export function createInitialMarketState(): MarketState {
  return Object.freeze({
    connection: 'connecting',
    replay: 'waiting',
    rows: new Map(),
    sequence: -1,
    hasSnapshot: false,
    reconnectAttempt: 0,
    notice: null,
    updatedAt: null,
    lastChange: null,
  });
}

export function applyServerMessage(
  current: MarketState,
  message: ServerMessage,
  now = Date.now(),
): MessageResult {
  if (message.type === 'snapshot') {
    return {
      reconnect: false,
      state: Object.freeze({
        ...current,
        rows: new Map(message.rows.map((row) => [row.symbol, row])),
        sequence: message.sequence,
        hasSnapshot: true,
        notice: null,
        updatedAt: now,
        lastChange: Object.freeze({
          kind: 'snapshot',
          rows: message.rows,
          sequence: message.sequence,
        }),
      }),
    };
  }

  if (message.type === 'delta') {
    if (!current.hasSnapshot) {
      return requireReconnect(current, 'A delta arrived before the snapshot.');
    }
    if (message.sequence <= current.sequence) {
      return { state: current, reconnect: false };
    }
    if (message.sequence !== current.sequence + 1) {
      return requireReconnect(
        current,
        `Sequence gap detected after ${String(current.sequence)}.`,
      );
    }
    const rows = new Map(current.rows);
    for (const row of message.rows) rows.set(row.symbol, row);
    return {
      reconnect: false,
      state: Object.freeze({
        ...current,
        rows,
        sequence: message.sequence,
        notice: null,
        updatedAt: now,
        lastChange: Object.freeze({
          kind: 'delta',
          rows: message.rows,
          sequence: message.sequence,
        }),
      }),
    };
  }

  if (current.hasSnapshot && message.sequence > current.sequence) {
    return requireReconnect(
      current,
      `Server status is ahead at sequence ${String(message.sequence)}.`,
    );
  }

  return {
    reconnect: false,
    state: Object.freeze({
      ...current,
      replay: message.status,
      notice: message.error,
    }),
  };
}

export function withConnection(
  current: MarketState,
  connection: ConnectionStatus,
  reconnectAttempt = current.reconnectAttempt,
): MarketState {
  return Object.freeze({ ...current, connection, reconnectAttempt });
}

export function withNotice(current: MarketState, notice: string): MarketState {
  return Object.freeze({ ...current, notice });
}

function requireReconnect(current: MarketState, notice: string): MessageResult {
  return {
    reconnect: true,
    state: Object.freeze({
      ...current,
      connection: 'reconnecting',
      notice,
    }),
  };
}
