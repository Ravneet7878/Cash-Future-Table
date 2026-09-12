import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('coerces values and supplies defaults', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgresql://localhost/example',
      PORT: '4000',
    });

    expect(config.PORT).toBe(4000);
    expect(config.DB_POOL_MAX).toBe(10);
    expect(config.NODE_ENV).toBe('development');
  });

  it('rejects an invalid database protocol', () => {
    expect(() =>
      loadConfig({ DATABASE_URL: 'https://example.com/database' }),
    ).toThrow('DATABASE_URL must use the postgres or postgresql protocol');
  });
});
