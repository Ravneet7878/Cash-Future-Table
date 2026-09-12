import { Pool, type PoolConfig } from 'pg';

import type { AppConfig } from './config.js';

export type Database = Pick<Pool, 'connect' | 'end' | 'query'>;

export function createDatabase(
  config: Pick<
    AppConfig,
    'DATABASE_URL' | 'DB_POOL_MAX' | 'DB_CONNECTION_TIMEOUT_MS'
  >,
): Pool {
  const poolConfig: PoolConfig = {
    connectionString: config.DATABASE_URL,
    max: config.DB_POOL_MAX,
    connectionTimeoutMillis: config.DB_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: 30_000,
    allowExitOnIdle: false,
  };

  return new Pool(poolConfig);
}

export async function checkDatabase(database: Database): Promise<void> {
  await database.query('SELECT 1');
}
