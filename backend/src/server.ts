import type { Server } from 'node:http';

import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { importContracts } from './contract-importer.js';
import { createDatabase } from './database.js';
import { startHttpServer } from './http-server.js';
import { createLogger } from './logger.js';
import { runMigrations } from './migrations.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  const database = createDatabase(config);
  let server: Server | undefined;
  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'graceful shutdown started');

    const forceExitTimer = setTimeout(() => {
      logger.fatal('graceful shutdown timed out');
      process.exit(1);
    }, config.SHUTDOWN_TIMEOUT_MS);
    forceExitTimer.unref();

    try {
      if (server !== undefined) {
        await new Promise<void>((resolve, reject) => {
          server?.close((error) => (error ? reject(error) : resolve()));
        });
      }
      await database.end();
      clearTimeout(forceExitTimer);
      logger.info('graceful shutdown complete');
      process.exitCode = 0;
    } catch (error) {
      clearTimeout(forceExitTimer);
      logger.error({ err: error }, 'graceful shutdown failed');
      process.exitCode = 1;
    }
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await runMigrations(database, logger);
    await importContracts(database, config, logger);
    const app = createApp({ database, logger });
    server = await startHttpServer(app, config.PORT, config.HOST);
    logger.info({ host: config.HOST, port: config.PORT }, 'server listening');
  } catch (error) {
    logger.fatal({ err: error }, 'backend startup failed');
    await database.end().catch(() => undefined);
    process.exitCode = 1;
  }
}

void main();
