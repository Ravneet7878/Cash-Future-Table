import { describe, expect, it } from 'vitest';

import { toWireMarketRow } from '../src/websocket-protocol.js';

describe('toWireMarketRow', () => {
  it('converts paise to protocol rupees and preserves nulls', () => {
    expect(
      toWireMarketRow({
        symbol: 'ABC',
        stockLtpPaise: 12_345,
        futureLtpPaise: 12_567,
        buySpreadPaise: 222,
        sellSpreadPaise: -245,
      }),
    ).toEqual({
      symbol: 'ABC',
      stockLtp: 123.45,
      futureLtp: 125.67,
      buySpread: 2.22,
      sellSpread: -2.45,
    });

    expect(
      toWireMarketRow({
        symbol: 'EMPTY',
        stockLtpPaise: null,
        futureLtpPaise: null,
        buySpreadPaise: null,
        sellSpreadPaise: null,
      }),
    ).toEqual({
      symbol: 'EMPTY',
      stockLtp: null,
      futureLtp: null,
      buySpread: null,
      sellSpread: null,
    });
  });
});
