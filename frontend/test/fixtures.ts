import type { MarketRow, SnapshotMessage } from '../src/protocol';

export function marketRow(
  symbol: string,
  overrides: Partial<Omit<MarketRow, 'symbol'>> = {},
): MarketRow {
  return {
    symbol,
    stockLtp: null,
    futureLtp: null,
    buySpread: null,
    sellSpread: null,
    ...overrides,
  };
}

export function snapshot(sequence = 0): SnapshotMessage {
  return {
    type: 'snapshot',
    version: 1,
    sequence,
    rows: Array.from({ length: 228 }, (_, index) =>
      marketRow(`SYMBOL${String(index).padStart(3, '0')}`),
    ),
  };
}
