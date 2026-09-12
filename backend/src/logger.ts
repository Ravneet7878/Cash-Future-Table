import pino, { type Logger } from 'pino';

import type { AppConfig } from './config.js';

export function createLogger(
  config: Pick<AppConfig, 'LOG_LEVEL' | 'NODE_ENV'>,
): Logger {
  return pino({
    level: config.LOG_LEVEL,
    base: { service: 'cash-future-backend', environment: config.NODE_ENV },
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie'],
      censor: '[REDACTED]',
    },
  });
}
