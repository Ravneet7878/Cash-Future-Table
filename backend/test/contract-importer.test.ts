import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import pino from 'pino';
import type { PoolClient } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { importContracts } from '../src/contract-importer.js';
import type { Database } from '../src/database.js';

const logger = pino({ enabled: false });
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true })),
  );
});

async function dataDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'cash-future-import-'));
  temporaryDirectories.push(directory);
  await Promise.all([
    writeFile(
      path.join(directory, 'cash.csv'),
      '1 1 EQUITY ABC -1 -1 EQ 1 1 1 1 -1 -1 ABC\n',
    ),
    writeFile(
      path.join(directory, 'future.csv'),
      '2 1 FUTSTK ABC 1795876200 -1 XX 1 1 1 1 -1 -1 ABC36DECFUT\n',
    ),
  ]);
  return directory;
}

type FakeState = Map<string, readonly unknown[]>;

function statefulDatabase(options: { failInsert?: boolean } = {}): {
  database: Database;
  state: FakeState;
  queries: string[];
  release: ReturnType<typeof vi.fn>;
} {
  const state: FakeState = new Map([
    ['NSECM:99', ['NSECM', 99, 'EQUITY', 'OLD', null, 'OLD']],
  ]);
  let snapshot: FakeState = new Map();
  const queries: string[] = [];
  const release = vi.fn();
  const client = {
    query: vi.fn((text: string, values?: unknown[]) => {
      const normalized = text.trim();
      queries.push(normalized);
      if (normalized === 'BEGIN') snapshot = new Map(state);
      if (normalized.startsWith('DELETE FROM app.contracts')) state.clear();
      if (normalized.startsWith('INSERT INTO app.contracts')) {
        if (options.failInsert === true)
          return Promise.reject(new Error('insert failed'));
        for (let index = 0; index < (values?.length ?? 0); index += 6) {
          const row = values?.slice(index, index + 6) ?? [];
          state.set(`${String(row[0])}:${String(row[1])}`, row);
        }
      }
      if (normalized === 'ROLLBACK') {
        state.clear();
        for (const [key, value] of snapshot) state.set(key, value);
      }
      return Promise.resolve({ rows: [] });
    }),
    release,
  } as unknown as PoolClient;
  return {
    database: {
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as Database,
    state,
    queries,
    release,
  };
}

describe('importContracts', () => {
  it('atomically replaces both segments and is stable when repeated', async () => {
    const directory = await dataDirectory();
    const fake = statefulDatabase();
    const config = {
      DATA_DIR: directory,
      NSE_CM_CONTRACT_FILE: 'cash.csv',
      NSE_FO_CONTRACT_FILE: 'future.csv',
    };

    const first = await importContracts(fake.database, config, logger);
    const firstState = [...fake.state.entries()];
    const second = await importContracts(fake.database, config, logger);

    expect(first).toEqual({
      cashContracts: 1,
      futureContracts: 1,
      totalContracts: 2,
    });
    expect(second).toEqual(first);
    expect([...fake.state.entries()]).toEqual(firstState);
    expect(fake.queries.filter((query) => query === 'COMMIT')).toHaveLength(2);
    expect(fake.release).toHaveBeenCalledTimes(2);
  });

  it('rolls back to the prior state when an insert fails', async () => {
    const directory = await dataDirectory();
    const fake = statefulDatabase({ failInsert: true });

    await expect(
      importContracts(
        fake.database,
        {
          DATA_DIR: directory,
          NSE_CM_CONTRACT_FILE: 'cash.csv',
          NSE_FO_CONTRACT_FILE: 'future.csv',
        },
        logger,
      ),
    ).rejects.toThrow('insert failed');

    expect([...fake.state.keys()]).toEqual(['NSECM:99']);
    expect(fake.queries).toContain('ROLLBACK');
    expect(fake.queries).not.toContain('COMMIT');
    expect(fake.release).toHaveBeenCalledOnce();
  });
});
