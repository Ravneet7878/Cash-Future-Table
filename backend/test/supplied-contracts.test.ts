import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseContractFile } from '../src/contracts.js';

const dataDirectory = process.env['DATA_DIR'];

describe.runIf(dataDirectory !== undefined)('supplied contract files', () => {
  it('contains the exact selected contract counts without duplicate market/token keys', async () => {
    const cash = await parseContractFile({
      filePath: path.join(
        dataDirectory ?? '',
        'nse_cm_ref_contract_master.csv',
      ),
      market: 'NSECM',
    });
    const futures = await parseContractFile({
      filePath: path.join(
        dataDirectory ?? '',
        'nse_fo_ref_contract_master.csv',
      ),
      market: 'NSEFO',
    });
    const keys = [...cash, ...futures].map(
      (contract) => `${contract.market}:${String(contract.token)}`,
    );

    expect(cash).toHaveLength(4_433);
    expect(futures).toHaveLength(647);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
