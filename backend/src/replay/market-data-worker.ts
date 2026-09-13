import { parentPort, workerData } from 'node:worker_threads';

import { streamMarketDataFile } from './market-data.js';
import type {
  ReplayWorkerInput,
  ReplayWorkerOutput,
} from './worker-protocol.js';

if (parentPort === null) {
  throw new Error('market-data worker requires a parent port');
}

const input = workerData as ReplayWorkerInput;
const port = parentPort;

async function waitForAcknowledgement(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    port.once('message', (message: unknown) => {
      if (
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        message.type === 'ack'
      )
        resolve();
      else reject(new Error('market-data worker received an invalid response'));
    });
  });
}

async function run(): Promise<void> {
  try {
    const summary = await streamMarketDataFile({
      filePath: input.filePath,
      selectedTokens: new Set(input.selectedTokens),
      batchSize: input.batchSize,
      onBatch: async (quotes) => {
        const message: ReplayWorkerOutput = {
          type: 'batch',
          market: input.market,
          quotes,
        };
        port.postMessage(message);
        await waitForAcknowledgement();
      },
    });
    const message: ReplayWorkerOutput = {
      type: 'complete',
      market: input.market,
      summary,
    };
    port.postMessage(message);
  } catch (error) {
    const message: ReplayWorkerOutput = {
      type: 'error',
      market: input.market,
      message: error instanceof Error ? error.message : 'unknown worker error',
    };
    port.postMessage(message);
  } finally {
    port.close();
  }
}

void run();
