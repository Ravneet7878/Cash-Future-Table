import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Logger } from 'pino';
import type { PoolClient } from 'pg';

import type { Database } from './database.js';

const MIGRATION_FILE_PATTERN = /^\d{3,}_[a-z0-9_]+\.sql$/;
const MIGRATION_LOCK_ID = 1_248_173_911;
const defaultMigrationsDirectory = fileURLToPath(
  new URL('../migrations', import.meta.url),
);

type AppliedMigration = {
  name: string;
  checksum: string;
};

function checksum(contents: string): string {
  return createHash('sha256').update(contents).digest('hex');
}

export async function runMigrations(
  database: Database,
  logger: Logger,
  migrationsDirectory = defaultMigrationsDirectory,
): Promise<void> {
  const client = await database.connect();

  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await createMigrationTable(client);

    const entries = (
      await readdir(migrationsDirectory, { withFileTypes: true })
    )
      .filter(
        (entry) => entry.isFile() && MIGRATION_FILE_PATTERN.test(entry.name),
      )
      .map((entry) => entry.name)
      .sort();

    const result = await client.query<AppliedMigration>(
      'SELECT name, checksum FROM schema_migrations',
    );
    const applied = new Map(
      result.rows.map((migration) => [migration.name, migration.checksum]),
    );

    for (const name of entries) {
      const sql = await readFile(path.join(migrationsDirectory, name), 'utf8');
      const expectedChecksum = checksum(sql);
      const storedChecksum = applied.get(name);

      if (storedChecksum !== undefined) {
        if (storedChecksum !== expectedChecksum) {
          throw new Error(`Checksum mismatch for applied migration: ${name}`);
        }
        continue;
      }

      await applyMigration(client, name, expectedChecksum, sql);
      logger.info({ migration: name }, 'database migration applied');
    }
  } finally {
    await client
      .query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID])
      .catch((error: unknown) => {
        logger.error({ err: error }, 'failed to release migration lock');
      });
    client.release();
  }
}

async function createMigrationTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function applyMigration(
  client: PoolClient,
  name: string,
  migrationChecksum: string,
  sql: string,
): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query(
      'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
      [name, migrationChecksum],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
