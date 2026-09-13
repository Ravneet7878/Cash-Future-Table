import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  parseMarketDataLine,
  streamMarketDataFile,
} from '../src/replay/market-data.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true })),
  );
});

async function marketDataFile(contents: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'cash-future-market-'));
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, 'market.csv');
  await writeFile(filePath, contents);
  return filePath;
}

describe('parseMarketDataLine', () => {
  it('keeps paise values and converts zero bid and ask to null', () => {
    expect(
      parseMarketDataLine('42,1472986477,0,0,2399480', 'data.csv', 7),
    ).toEqual({
      token: 42,
      timestamp: 1_472_986_477,
      sourceRow: 7,
      bidPaise: null,
      askPaise: null,
      ltpPaise: 2_399_480,
    });
  });

  it.each([
    ['missing field', '42,1,2,3'],
    ['non-integer', '42,1,2.5,3,4'],
    ['negative price', '42,1,2,-1,4'],
    ['non-positive token', '0,1,2,3,4'],
  ])('reports file and line for a %s', (_caseName, line) => {
    expect(() => parseMarketDataLine(line, 'data.csv', 9)).toThrow(
      /^data\.csv:9:/u,
    );
  });
});

describe('streamMarketDataFile', () => {
  it('filters tokens, emits bounded batches, and waits for each consumer', async () => {
    const filePath = await marketDataFile(
      [
        '1,1,10,11,12',
        '99,1,20,21,22',
        '1,2,30,31,32',
        '2,3,40,41,42',
        '1,4,50,51,52',
      ].join('\n'),
    );
    const batches: number[][] = [];
    let activeConsumers = 0;
    let maximumActiveConsumers = 0;

    const summary = await streamMarketDataFile({
      filePath,
      selectedTokens: new Set([1, 2]),
      batchSize: 2,
      onBatch: async (batch) => {
        activeConsumers += 1;
        maximumActiveConsumers = Math.max(
          maximumActiveConsumers,
          activeConsumers,
        );
        await Promise.resolve();
        batches.push(batch.map((quote) => quote.token));
        activeConsumers -= 1;
      },
    });

    expect(batches).toEqual([
      [1, 1],
      [2, 1],
    ]);
    expect(maximumActiveConsumers).toBe(1);
    expect(summary).toEqual({
      linesRead: 5,
      matchedRows: 4,
      batches: 2,
      maximumBatchSize: 2,
    });
  });

  it('rejects invalid batch sizes before reading', async () => {
    await expect(
      streamMarketDataFile({
        filePath: '/not/read.csv',
        selectedTokens: new Set(),
        batchSize: 0,
        onBatch: () => undefined,
      }),
    ).rejects.toThrow('batchSize must be a positive safe integer');
  });
});
