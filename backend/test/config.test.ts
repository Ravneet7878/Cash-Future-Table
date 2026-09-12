import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';

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
  });
});
