import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ContractParseError, parseContractFile } from '../src/contracts.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true })),
  );
});

async function contractFile(
  contents: string,
  name = 'contracts.csv',
): Promise<string> {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'cash-future-contracts-'),
  );
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, name);
  await writeFile(filePath, contents);
  return filePath;
}

describe('parseContractFile', () => {
  it('filters instruments and maps cash and future expiry semantics', async () => {
    const cashPath = await contractFile(
      [
        '1 1 EQUITY ABC -1 -1 EQ 1 1 1 1 -1 -1 ABC',
        '2 1 INDEX NIFTY -1 -1 XX 1 1 1 1 -1 -1 NIFTY',
      ].join('\n'),
      'cash.csv',
    );
    const futurePath = await contractFile(
      [
        '3 1 FUTSTK ABC 1795876200 -1 XX 1 1 1 1 -1 -1 ABC36DECFUT',
        '4 1 OPTSTK ABC 1795876200 100 CE 1 1 1 1 -1 -1 ABCOPT',
      ].join('\n'),
      'future.csv',
    );

    await expect(
      parseContractFile({ filePath: cashPath, market: 'NSECM' }),
    ).resolves.toEqual([
      {
        market: 'NSECM',
        token: 1,
        instrumentType: 'EQUITY',
        symbol: 'ABC',
        expiryDate: null,
        contractName: 'ABC',
      },
    ]);
    const futures = await parseContractFile({
      filePath: futurePath,
      market: 'NSEFO',
    });
    expect(futures).toHaveLength(1);
    expect(futures[0]).toMatchObject({
      instrumentType: 'FUTSTK',
      expiryDate: '2026-11-28',
    });
  });

  it('reports the filename and line for malformed data', async () => {
    const filePath = await contractFile(
      ['1 1 EQUITY ABC -1 -1 EQ 1 1 1 1 -1 -1 ABC', 'not enough fields'].join(
        '\n',
      ),
      'broken.csv',
    );

    try {
      await parseContractFile({ filePath, market: 'NSECM' });
      expect.fail('expected parsing to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ContractParseError);
      if (!(error instanceof ContractParseError)) throw error;
      expect(error.file).toBe('broken.csv');
      expect(error.line).toBe(2);
      expect(error.message).toContain('broken.csv:2:');
    }
  });

  it('rejects duplicate selected tokens', async () => {
    const filePath = await contractFile(
      [
        '1 1 EQUITY ABC -1 -1 EQ 1 1 1 1 -1 -1 ABC',
        '1 1 EQUITY XYZ -1 -1 EQ 1 1 1 1 -1 -1 XYZ',
      ].join('\n'),
      'duplicates.csv',
    );

    await expect(
      parseContractFile({ filePath, market: 'NSECM' }),
    ).rejects.toThrow('duplicates.csv:2: duplicate selected token 1');
  });
});
