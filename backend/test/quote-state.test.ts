import { describe, expect, it } from 'vitest';

import type { ContractUniverseEntry } from '../src/contract-universe.js';
import type { MarketDataQuote } from '../src/replay/market-data.js';
import { QuoteStateStore } from '../src/replay/quote-state.js';

const contract: ContractUniverseEntry = {
  symbol: 'ABC',
  cashToken: 1,
  futureToken: 2,
  futureExpiry: '2026-09-24',
};

function quote(
  token: number,
  timestamp: number,
  sourceRow: number,
  values: Partial<MarketDataQuote> = {},
): MarketDataQuote {
  return {
    token,
    timestamp,
    sourceRow,
    bidPaise: 100,
    askPaise: 110,
    ltpPaise: 105,
    ...values,
  };
}

describe('QuoteStateStore', () => {
  it('retains every universe row before quotes arrive', () => {
    const universe = Array.from({ length: 228 }, (_, index) => ({
      symbol: `SYMBOL${String(index)}`,
      cashToken: index + 1,
      futureToken: index + 1_001,
      futureExpiry: '2026-09-24',
    }));

    const snapshot = new QuoteStateStore(universe).snapshot();

    expect(snapshot).toHaveLength(228);
    expect(snapshot[0]).toEqual({
      symbol: 'SYMBOL0',
      stockLtpPaise: null,
      futureLtpPaise: null,
      buySpreadPaise: null,
      sellSpreadPaise: null,
    });
  });

  it('calculates both spreads in paise and propagates unavailable prices', () => {
    const state = new QuoteStateStore([contract]);
    state.applyBatch('NSECM', [
      quote(1, 10, 1, {
        bidPaise: 10_000,
        askPaise: 10_100,
        ltpPaise: 10_050,
      }),
    ]);
    const changed = state.applyBatch('NSEFO', [
      quote(2, 11, 1, {
        bidPaise: 10_350,
        askPaise: 10_450,
        ltpPaise: 10_400,
      }),
    ]);

    expect(changed).toEqual([
      {
        symbol: 'ABC',
        stockLtpPaise: 10_050,
        futureLtpPaise: 10_400,
        buySpreadPaise: 250,
        sellSpreadPaise: -450,
      },
    ]);

    expect(
      state.applyBatch('NSEFO', [
        quote(2, 12, 2, { bidPaise: null, askPaise: null }),
      ]),
    ).toEqual([
      {
        symbol: 'ABC',
        stockLtpPaise: 10_050,
        futureLtpPaise: 105,
        buySpreadPaise: null,
        sellSpreadPaise: null,
      },
    ]);
  });

  it('accepts newer timestamps and uses the later source row for ties', () => {
    const state = new QuoteStateStore([contract]);
    state.applyBatch('NSECM', [quote(1, 20, 10, { ltpPaise: 200 })]);

    expect(
      state.applyBatch('NSECM', [quote(1, 19, 20, { ltpPaise: 190 })]),
    ).toEqual([]);
    expect(
      state.applyBatch('NSECM', [quote(1, 20, 9, { ltpPaise: 199 })]),
    ).toEqual([]);
    expect(
      state.applyBatch('NSECM', [quote(1, 20, 11, { ltpPaise: 201 })]),
    ).toEqual([
      {
        symbol: 'ABC',
        stockLtpPaise: 201,
        futureLtpPaise: null,
        buySpreadPaise: null,
        sellSpreadPaise: null,
      },
    ]);
  });

  it('rejects an unexpected token from a worker', () => {
    const state = new QuoteStateStore([contract]);

    expect(() => state.applyBatch('NSECM', [quote(99, 1, 1)])).toThrow(
      'NSECM worker returned unselected token 99',
    );
  });
});
