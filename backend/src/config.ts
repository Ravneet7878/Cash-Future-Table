import path from 'node:path';

import { z } from 'zod';

const fileNameSchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) =>
      path.basename(value) === value && value !== '.' && value !== '..',
    {
      message: 'must be a filename without directory components',
    },
  );

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  DATABASE_URL: z
    .url()
    .refine(
      (url) => ['postgres:', 'postgresql:'].includes(new URL(url).protocol),
      {
        message: 'DATABASE_URL must use the postgres or postgresql protocol',
      },
    ),
  DATA_DIR: z
    .string()
    .trim()
    .min(1)
    .refine((value) => path.isAbsolute(value), {
      message: 'DATA_DIR must be an absolute path',
    }),
  NSE_CM_CONTRACT_FILE: fileNameSchema.default(
    'nse_cm_ref_contract_master.csv',
  ),
  NSE_FO_CONTRACT_FILE: fileNameSchema.default(
    'nse_fo_ref_contract_master.csv',
  ),
  NSE_CM_MARKET_DATA_FILE: fileNameSchema.default('nsecm_market_data.csv'),
  NSE_FO_MARKET_DATA_FILE: fileNameSchema.default('nsefo_market_data.csv'),
  REPLAY_BATCH_SIZE: z.coerce.number().int().min(1).max(10_000).default(500),
  WEBSOCKET_PATH: z
    .string()
    .regex(/^\/[a-zA-Z0-9/_-]*$/u)
    .default('/ws'),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
});

export type AppConfig = z.infer<typeof environmentSchema>;
export type ContractFileConfig = Pick<
  AppConfig,
  'DATA_DIR' | 'NSE_CM_CONTRACT_FILE' | 'NSE_FO_CONTRACT_FILE'
>;
export type MarketReplayConfig = Pick<
  AppConfig,
  | 'DATA_DIR'
  | 'NSE_CM_MARKET_DATA_FILE'
  | 'NSE_FO_MARKET_DATA_FILE'
  | 'REPLAY_BATCH_SIZE'
>;

export type ContractFilePaths = Readonly<{
  cash: string;
  future: string;
}>;

export type MarketDataFilePaths = Readonly<{
  cash: string;
  future: string;
}>;

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  return environmentSchema.parse(environment);
}

export function resolveContractFilePaths(
  config: ContractFileConfig,
): ContractFilePaths {
  return Object.freeze({
    cash: path.join(config.DATA_DIR, config.NSE_CM_CONTRACT_FILE),
    future: path.join(config.DATA_DIR, config.NSE_FO_CONTRACT_FILE),
  });
}

export function resolveMarketDataFilePaths(
  config: MarketReplayConfig,
): MarketDataFilePaths {
  return Object.freeze({
    cash: path.join(config.DATA_DIR, config.NSE_CM_MARKET_DATA_FILE),
    future: path.join(config.DATA_DIR, config.NSE_FO_MARKET_DATA_FILE),
  });
}
