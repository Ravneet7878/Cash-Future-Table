import type { Database } from './database.js';

export const EXPECTED_CONTRACT_UNIVERSE_SIZE = 228;
export const EXPECTED_NSETEST_SYMBOLS = 18;

export type ContractUniverseEntry = Readonly<{
  symbol: string;
  cashToken: number;
  futureToken: number;
  futureExpiry: string;
}>;

type ContractUniverseDatabaseRow = {
  symbol: unknown;
  cash_token: unknown;
  future_token: unknown;
  future_expiry: unknown;
};

export const CONTRACT_UNIVERSE_QUERY = `
  SELECT
    symbol,
    cash_token::text,
    future_token::text,
    future_expiry::text
  FROM app.contract_universe
  ORDER BY symbol ASC
`;

export class ContractUniverseError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ContractUniverseError';
  }
}

export async function loadContractUniverse(
  database: Database,
): Promise<readonly ContractUniverseEntry[]> {
  const result = await database.query<ContractUniverseDatabaseRow>(
    CONTRACT_UNIVERSE_QUERY,
  );
  const entries = result.rows.map(toContractUniverseEntry);

  validateUniverse(entries);
  return Object.freeze(entries);
}

function toContractUniverseEntry(
  row: ContractUniverseDatabaseRow,
  index: number,
): ContractUniverseEntry {
  const rowNumber = index + 1;
  if (typeof row.symbol !== 'string' || row.symbol.length === 0) {
    throw new ContractUniverseError(
      `contract universe row ${String(rowNumber)} has an invalid symbol`,
    );
  }

  if (
    typeof row.future_expiry !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(row.future_expiry)
  ) {
    throw new ContractUniverseError(
      `contract universe row ${String(rowNumber)} has an invalid future expiry`,
    );
  }

  return Object.freeze({
    symbol: row.symbol,
    cashToken: parseToken(row.cash_token, 'cash', rowNumber),
    futureToken: parseToken(row.future_token, 'future', rowNumber),
    futureExpiry: row.future_expiry,
  });
}

function parseToken(value: unknown, market: string, rowNumber: number): number {
  if (typeof value !== 'string' || !/^\d+$/u.test(value)) {
    throw new ContractUniverseError(
      `contract universe row ${String(rowNumber)} has an invalid ${market} token`,
    );
  }
  const token = Number(value);
  if (!Number.isSafeInteger(token) || token <= 0) {
    throw new ContractUniverseError(
      `contract universe row ${String(rowNumber)} has an invalid ${market} token`,
    );
  }
  return token;
}

function validateUniverse(entries: readonly ContractUniverseEntry[]): void {
  const symbols = new Set(entries.map((entry) => entry.symbol));
  if (symbols.size !== entries.length) {
    throw new ContractUniverseError(
      `contract universe contains ${String(entries.length - symbols.size)} duplicate symbol(s)`,
    );
  }

  if (entries.length !== EXPECTED_CONTRACT_UNIVERSE_SIZE) {
    throw new ContractUniverseError(
      `contract universe expected ${String(EXPECTED_CONTRACT_UNIVERSE_SIZE)} rows, received ${String(entries.length)}`,
    );
  }

  const nseTestCount = entries.filter((entry) =>
    entry.symbol.endsWith('NSETEST'),
  ).length;
  if (nseTestCount !== EXPECTED_NSETEST_SYMBOLS) {
    throw new ContractUniverseError(
      `contract universe expected ${String(EXPECTED_NSETEST_SYMBOLS)} NSETEST symbols, received ${String(nseTestCount)}`,
    );
  }
}
