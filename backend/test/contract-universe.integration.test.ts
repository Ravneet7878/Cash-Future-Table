import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import {
  EXPECTED_CONTRACT_UNIVERSE_SIZE,
  EXPECTED_NSETEST_SYMBOLS,
  loadContractUniverse,
} from '../src/contract-universe.js';

const databaseUrl = process.env['DATABASE_URL'];
const database =
  databaseUrl === undefined
    ? undefined
    : new Pool({
        connectionString: databaseUrl,
        max: 1,
      });

afterAll(async () => {
  await database?.end();
});

describe.runIf(database !== undefined)(
  'contract universe PostgreSQL view',
  () => {
    it('returns the supplied absolute-minimum-expiry universe', async () => {
      if (database === undefined) throw new Error('database is unavailable');
      const universe = await loadContractUniverse(database);

      expect(universe).toHaveLength(EXPECTED_CONTRACT_UNIVERSE_SIZE);
      expect(
        universe.filter((entry) => entry.symbol.endsWith('NSETEST')),
      ).toHaveLength(EXPECTED_NSETEST_SYMBOLS);
      expect(new Set(universe.map((entry) => entry.symbol)).size).toBe(
        EXPECTED_CONTRACT_UNIVERSE_SIZE,
      );

      const mismatches = await database.query<{ symbol: string }>(`
      SELECT universe.symbol
      FROM app.contract_universe AS universe
      WHERE universe.future_expiry <> (
        SELECT min(contract.expiry_date)
        FROM app.contracts AS contract
        WHERE contract.market = 'NSEFO'
          AND contract.instrument_type = 'FUTSTK'
          AND contract.symbol = universe.symbol
      )
    `);
      expect(mismatches.rows).toEqual([]);
    });
  },
);
