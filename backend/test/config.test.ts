import { describe, expect, it } from 'vitest';

import {
  loadConfig,
  resolveContractFilePaths,
  resolveMarketDataFilePaths,
} from '../src/config.js';

describe('loadConfig', () => {
  it('coerces values and supplies defaults', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgresql://localhost/example',
      DATA_DIR: '/external/data',
      PORT: '4000',
    });

    expect(config.PORT).toBe(4000);
    expect(config.DB_POOL_MAX).toBe(10);
    expect(config.NODE_ENV).toBe('development');
    expect(config.NSE_CM_CONTRACT_FILE).toBe('nse_cm_ref_contract_master.csv');
    expect(config.NSE_FO_CONTRACT_FILE).toBe('nse_fo_ref_contract_master.csv');
    expect(config.NSE_CM_MARKET_DATA_FILE).toBe('nsecm_market_data.csv');
    expect(config.NSE_FO_MARKET_DATA_FILE).toBe('nsefo_market_data.csv');
    expect(config.REPLAY_BATCH_SIZE).toBe(500);
  });

  it('rejects an invalid database protocol', () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: 'https://example.com/database',
        DATA_DIR: '/external/data',
      }),
    ).toThrow('DATABASE_URL must use the postgres or postgresql protocol');
  });

  it('requires an absolute data directory and safe filenames', () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: 'postgresql://localhost/example',
        DATA_DIR: 'relative/data',
      }),
    ).toThrow('DATA_DIR must be an absolute path');
    expect(() =>
      loadConfig({
        DATABASE_URL: 'postgresql://localhost/example',
        DATA_DIR: '/external/data',
        NSE_CM_CONTRACT_FILE: '../contracts.csv',
      }),
    ).toThrow('must be a filename without directory components');
    expect(() =>
      loadConfig({
        DATABASE_URL: 'postgresql://localhost/example',
        DATA_DIR: '/external/data',
        NSE_FO_MARKET_DATA_FILE: '../market.csv',
      }),
    ).toThrow('must be a filename without directory components');
  });

  it('resolves every configured data file from the validated data directory', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgresql://localhost/example',
      DATA_DIR: '/external/data',
    });

    expect(resolveContractFilePaths(config)).toEqual({
      cash: '/external/data/nse_cm_ref_contract_master.csv',
      future: '/external/data/nse_fo_ref_contract_master.csv',
    });
    expect(resolveMarketDataFilePaths(config)).toEqual({
      cash: '/external/data/nsecm_market_data.csv',
      future: '/external/data/nsefo_market_data.csv',
    });
  });
});
