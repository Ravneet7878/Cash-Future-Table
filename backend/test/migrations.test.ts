import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import pino from 'pino';
import type { PoolClient, QueryResult } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '../src/database.js';
import { runMigrations } from '../src/migrations.js';

const logger = pino({ enabled: false });
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true })),
  );
});

async function migrationDirectory(
  files: Record<string, string>,
): Promise<string> {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'cash-future-migrations-'),
  );
  temporaryDirectories.push(directory);
  await Promise.all(
    Object.entries(files).map(([name, contents]) =>
      writeFile(path.join(directory, name), contents),
    ),
  );
  return directory;
}

function fakeDatabase(
  applied: { name: string; checksum: string }[] = [],
  failSql?: string,
): {
  database: Database;
  queries: string[];
  release: ReturnType<typeof vi.fn>;
} {
  const queries: string[] = [];
  const release = vi.fn();
  const client = {
    query: vi.fn((text: string): Promise<Partial<QueryResult>> => {
      const normalized = text.trim();
      queries.push(normalized);
      if (normalized === failSql)
        return Promise.reject(new Error('migration SQL failed'));
      if (normalized === 'SELECT name, checksum FROM schema_migrations')
        return Promise.resolve({ rows: applied });
      return Promise.resolve({ rows: [] });
    }),
    release,
  } as unknown as PoolClient;
  const database = {
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as Database;
  return { database, queries, release };
}

describe('runMigrations', () => {
  it('applies migration files in lexical order and releases the lock', async () => {
    const directory = await migrationDirectory({
      '002_second.sql': 'CREATE TABLE second();',
      '001_first.sql': 'CREATE TABLE first();',
      'notes.txt': 'ignored',
    });
    const fake = fakeDatabase();

    await runMigrations(fake.database, logger, directory);

    expect(fake.queries.indexOf('CREATE TABLE first();')).toBeLessThan(
      fake.queries.indexOf('CREATE TABLE second();'),
    );
    expect(fake.queries.at(-1)).toBe('SELECT pg_advisory_unlock($1)');
    expect(fake.release).toHaveBeenCalledOnce();
  });

  it('rejects a changed applied migration checksum and still releases the lock', async () => {
    const sql = 'CREATE TABLE immutable();';
    const directory = await migrationDirectory({ '001_immutable.sql': sql });
    const fake = fakeDatabase([
      { name: '001_immutable.sql', checksum: 'incorrect' },
    ]);

    await expect(
      runMigrations(fake.database, logger, directory),
    ).rejects.toThrow(
      'Checksum mismatch for applied migration: 001_immutable.sql',
    );

    expect(fake.queries).toContain('SELECT pg_advisory_unlock($1)');
    expect(fake.queries).not.toContain(sql);
    expect(fake.release).toHaveBeenCalledOnce();
  });

  it('skips a migration whose stored checksum matches', async () => {
    const sql = 'CREATE TABLE already_applied();';
    const directory = await migrationDirectory({ '001_applied.sql': sql });
    const checksum = createHash('sha256').update(sql).digest('hex');
    const fake = fakeDatabase([{ name: '001_applied.sql', checksum }]);

    await runMigrations(fake.database, logger, directory);

    expect(fake.queries).not.toContain(sql);
    expect(fake.queries).not.toContain('BEGIN');
  });

  it('rolls back a failed migration and releases the lock', async () => {
    const sql = 'CREATE TABLE fails();';
    const directory = await migrationDirectory({ '001_fails.sql': sql });
    const fake = fakeDatabase([], sql);

    await expect(
      runMigrations(fake.database, logger, directory),
    ).rejects.toThrow('migration SQL failed');

    expect(fake.queries).toContain('BEGIN');
    expect(fake.queries).toContain('ROLLBACK');
    expect(fake.queries).not.toContain('COMMIT');
    expect(fake.queries.at(-1)).toBe('SELECT pg_advisory_unlock($1)');
  });
});
