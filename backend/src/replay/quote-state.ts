import type { ContractUniverseEntry } from '../contract-universe.js';
import type { ContractMarket } from '../contracts.js';
import type { MarketDataQuote } from './market-data.js';

export type MarketRowState = Readonly<{
  symbol: string;
  stockLtpPaise: number | null;
  futureLtpPaise: number | null;
  buySpreadPaise: number | null;
  sellSpreadPaise: number | null;
}>;

type QuoteLegState = MarketDataQuote;

type InternalRowState = {
  contract: ContractUniverseEntry;
  stock: QuoteLegState | null;
  future: QuoteLegState | null;
};

type TokenTarget = Readonly<{
  symbol: string;
  leg: 'stock' | 'future';
}>;

export class QuoteStateStore {
  readonly #rows = new Map<string, InternalRowState>();
  readonly #cashTokens = new Map<number, TokenTarget>();
  readonly #futureTokens = new Map<number, TokenTarget>();

  public constructor(universe: readonly ContractUniverseEntry[]) {
    for (const contract of universe) {
      if (this.#rows.has(contract.symbol)) {
        throw new Error(`duplicate universe symbol ${contract.symbol}`);
      }
      if (this.#cashTokens.has(contract.cashToken)) {
        throw new Error(`duplicate cash token ${String(contract.cashToken)}`);
      }
      if (this.#futureTokens.has(contract.futureToken)) {
        throw new Error(
          `duplicate future token ${String(contract.futureToken)}`,
        );
      }

      this.#rows.set(contract.symbol, {
        contract,
        stock: null,
        future: null,
      });
      this.#cashTokens.set(contract.cashToken, {
        symbol: contract.symbol,
        leg: 'stock',
      });
      this.#futureTokens.set(contract.futureToken, {
        symbol: contract.symbol,
        leg: 'future',
      });
    }
  }

  public selectedTokens(market: ContractMarket): readonly number[] {
    return Object.freeze([
      ...(market === 'NSECM'
        ? this.#cashTokens.keys()
        : this.#futureTokens.keys()),
    ]);
  }

  public applyBatch(
    market: ContractMarket,
    quotes: readonly MarketDataQuote[],
  ): readonly MarketRowState[] {
    const tokens = market === 'NSECM' ? this.#cashTokens : this.#futureTokens;
    const beforeBySymbol = new Map<string, MarketRowState>();

    for (const quote of quotes) {
      const target = tokens.get(quote.token);
      if (target === undefined) {
        throw new Error(
          `${market} worker returned unselected token ${String(quote.token)}`,
        );
      }
      const row = this.#rows.get(target.symbol);
      if (row === undefined)
        throw new Error(`missing row for ${target.symbol}`);

      const previous = target.leg === 'stock' ? row.stock : row.future;
      if (!isNewer(quote, previous)) continue;
      if (!beforeBySymbol.has(target.symbol)) {
        beforeBySymbol.set(target.symbol, toMarketRowState(row));
      }
      if (target.leg === 'stock') row.stock = quote;
      else row.future = quote;
    }

    const changed: MarketRowState[] = [];
    for (const [symbol, before] of beforeBySymbol) {
      const row = this.#rows.get(symbol);
      if (row === undefined) throw new Error(`missing row for ${symbol}`);
      const after = toMarketRowState(row);
      if (!rowsEqual(before, after)) changed.push(after);
    }
    return Object.freeze(changed);
  }

  public snapshot(): readonly MarketRowState[] {
    return Object.freeze([...this.#rows.values()].map(toMarketRowState));
  }
}

function isNewer(
  incoming: MarketDataQuote,
  current: MarketDataQuote | null,
): boolean {
  return (
    current === null ||
    incoming.timestamp > current.timestamp ||
    (incoming.timestamp === current.timestamp &&
      incoming.sourceRow > current.sourceRow)
  );
}

function toMarketRowState(row: InternalRowState): MarketRowState {
  return Object.freeze({
    symbol: row.contract.symbol,
    stockLtpPaise: row.stock?.ltpPaise ?? null,
    futureLtpPaise: row.future?.ltpPaise ?? null,
    buySpreadPaise: subtract(row.future?.bidPaise, row.stock?.askPaise),
    sellSpreadPaise: subtract(row.stock?.bidPaise, row.future?.askPaise),
  });
}

function subtract(
  left: number | null | undefined,
  right: number | null | undefined,
): number | null {
  return left == null || right == null ? null : left - right;
}

function rowsEqual(left: MarketRowState, right: MarketRowState): boolean {
  return (
    left.stockLtpPaise === right.stockLtpPaise &&
    left.futureLtpPaise === right.futureLtpPaise &&
    left.buySpreadPaise === right.buySpreadPaise &&
    left.sellSpreadPaise === right.sellSpreadPaise
  );
}
