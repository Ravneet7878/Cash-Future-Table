import { describe, expect, it, vi } from 'vitest';

import {
  CONTRACT_UNIVERSE_QUERY,
  ContractUniverseError,
  EXPECTED_CONTRACT_UNIVERSE_SIZE,
  EXPECTED_NSETEST_SYMBOLS,
  loadContractUniverse,
} from '../src/contract-universe.js';
import type { Database } from '../src/database.js';

type DatabaseRow = {
  symbol: string;
  cash_token: string;
  future_token: string;
  future_expiry: string;
};

function validRows(): DatabaseRow[] {
  return Array.from(
    { length: EXPECTED_CONTRACT_UNIVERSE_SIZE },
    (_, index) => ({
      symbol:
        index < EXPECTED_NSETEST_SYMBOLS
          ? `${String(index + 1).padStart(3, '0')}NSETEST`
          : `SYMBOL${String(index + 1).padStart(3, '0')}`,
      cash_token: String(index + 1),
      future_token: String(index + 10_001),
      future_expiry: '2026-09-24',
    }),
  );
}

function databaseWithRows(rows: DatabaseRow[]): Database {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  } as unknown as Database;
}

function rowAt(rows: DatabaseRow[], index: number): DatabaseRow {
  const row = rows[index];
  if (row === undefined)
    throw new Error(`missing fixture row ${String(index)}`);
  return row;
}

describe('loadContractUniverse', () => {
  it('returns the ordered database contract with numeric tokens', async () => {
    const database = databaseWithRows(validRows());

    const universe = await loadContractUniverse(database);

    expect(database.query).toHaveBeenCalledWith(CONTRACT_UNIVERSE_QUERY);
    expect(universe).toHaveLength(228);
    expect(universe[0]).toEqual({
      symbol: '001NSETEST',
      cashToken: 1,
      futureToken: 10_001,
      futureExpiry: '2026-09-24',
    });
    expect(Object.isFrozen(universe)).toBe(true);
    expect(Object.isFrozen(universe[0])).toBe(true);
  });

  it('rejects a universe with a duplicate symbol', async () => {
    const rows = validRows();
    rows[1] = { ...rowAt(rows, 1), symbol: rowAt(rows, 0).symbol };

    await expect(loadContractUniverse(databaseWithRows(rows))).rejects.toThrow(
      new ContractUniverseError(
        'contract universe contains 1 duplicate symbol(s)',
      ),
    );
  });

  it('rejects a universe with the wrong total row count', async () => {
    const rows = validRows().slice(0, -1);

    await expect(loadContractUniverse(databaseWithRows(rows))).rejects.toThrow(
      'contract universe expected 228 rows, received 227',
    );
  });

  it('rejects a universe missing an NSETEST symbol', async () => {
    const rows = validRows();
    rows[0] = { ...rowAt(rows, 0), symbol: 'REPLACEMENT' };

    await expect(loadContractUniverse(databaseWithRows(rows))).rejects.toThrow(
      'contract universe expected 18 NSETEST symbols, received 17',
    );
  });

  it.each([
    ['unsafe token', { cash_token: '9007199254740992' }],
    ['non-positive token', { future_token: '0' }],
    ['invalid expiry', { future_expiry: '24-09-2026' }],
  ])('rejects an %s in a database row', async (_caseName, replacement) => {
    const rows = validRows();
    rows[0] = { ...rowAt(rows, 0), ...replacement };

    await expect(
      loadContractUniverse(databaseWithRows(rows)),
    ).rejects.toBeInstanceOf(ContractUniverseError);
  });
});
