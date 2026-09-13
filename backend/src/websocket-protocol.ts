import type { MarketRowState } from './replay/quote-state.js';

export const WEBSOCKET_PROTOCOL_VERSION = 1 as const;

export type ReplayStatus = 'waiting' | 'running' | 'complete' | 'error';

export type WireMarketRow = Readonly<{
  symbol: string;
  stockLtp: number | null;
  futureLtp: number | null;
  buySpread: number | null;
  sellSpread: number | null;
}>;

export type SnapshotMessage = Readonly<{
  type: 'snapshot';
  version: typeof WEBSOCKET_PROTOCOL_VERSION;
  sequence: number;
  rows: readonly WireMarketRow[];
}>;

export type DeltaMessage = Readonly<{
  type: 'delta';
  version: typeof WEBSOCKET_PROTOCOL_VERSION;
  sequence: number;
  rows: readonly WireMarketRow[];
}>;

export type StatusMessage = Readonly<{
  type: 'status';
  version: typeof WEBSOCKET_PROTOCOL_VERSION;
  sequence: number;
  status: ReplayStatus;
  error: string | null;
}>;

export type ServerMessage = SnapshotMessage | DeltaMessage | StatusMessage;

export function toWireMarketRow(row: MarketRowState): WireMarketRow {
  return Object.freeze({
    symbol: row.symbol,
    stockLtp: fromPaise(row.stockLtpPaise),
    futureLtp: fromPaise(row.futureLtpPaise),
    buySpread: fromPaise(row.buySpreadPaise),
    sellSpread: fromPaise(row.sellSpreadPaise),
  });
}

function fromPaise(value: number | null): number | null {
  return value === null ? null : value / 100;
}
