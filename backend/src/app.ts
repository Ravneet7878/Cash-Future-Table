import { randomUUID } from 'node:crypto';

import express, { type Express } from 'express';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';

import { checkDatabase, type Database } from './database.js';
import { createErrorHandler, notFoundHandler } from './errors.js';

export type AppDependencies = {
  database: Database;
  logger: Logger;
};

export function createApp({ database, logger }: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(
    pinoHttp({
      logger,
      genReqId(request, response) {
        const incomingRequestId = request.headers['x-request-id'];
        const requestId =
          typeof incomingRequestId === 'string'
            ? incomingRequestId
            : randomUUID();
        response.setHeader('x-request-id', requestId);
        return requestId;
      },
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.get('/health/live', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.get('/health/ready', async (_request, response) => {
    try {
      await checkDatabase(database);
      response.json({ status: 'ready', checks: { database: 'up' } });
    } catch (error) {
      logger.warn({ err: error }, 'readiness check failed');
      response
        .status(503)
        .json({ status: 'not_ready', checks: { database: 'down' } });
    }
  });

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
