import { Worker } from 'node:worker_threads';

import {
  resolveMarketDataFilePaths,
  type MarketReplayConfig,
} from '../config.js';
import type { ContractUniverseEntry } from '../contract-universe.js';
import type { ContractMarket } from '../contracts.js';
import type { MarketDataStreamSummary } from './market-data.js';
import { QuoteStateStore, type MarketRowState } from './quote-state.js';
import type {
  ReplayWorkerAcknowledgement,
  ReplayWorkerInput,
  ReplayWorkerOutput,
} from './worker-protocol.js';

export type MarketReplayOptions = Readonly<{
  cashFilePath: string;
  futureFilePath: string;
  batchSize: number;
  onRowsChanged?: (rows: readonly MarketRowState[]) => void;
}>;

export type MarketReplaySummary = Readonly<{
  cash: MarketDataStreamSummary;
  future: MarketDataStreamSummary;
}>;

export function createMarketReplayEngine(
  universe: readonly ContractUniverseEntry[],
  config: MarketReplayConfig,
  onRowsChanged?: (rows: readonly MarketRowState[]) => void,
): MarketReplayEngine {
  const files = resolveMarketDataFilePaths(config);
  return new MarketReplayEngine(universe, {
    cashFilePath: files.cash,
    futureFilePath: files.future,
    batchSize: config.REPLAY_BATCH_SIZE,
    ...(onRowsChanged === undefined ? {} : { onRowsChanged }),
  });
}

export class MarketReplayEngine {
  readonly #state: QuoteStateStore;
  readonly #options: MarketReplayOptions;
  #started = false;

  public constructor(
    universe: readonly ContractUniverseEntry[],
    options: MarketReplayOptions,
  ) {
    this.#state = new QuoteStateStore(universe);
    this.#options = options;
  }

  public snapshot(): readonly MarketRowState[] {
    return this.#state.snapshot();
  }

  public async run(): Promise<MarketReplaySummary> {
    if (this.#started) throw new Error('market replay has already started');
    this.#started = true;

    const workers = [
      this.#createWorker('NSECM', this.#options.cashFilePath),
      this.#createWorker('NSEFO', this.#options.futureFilePath),
    ] as const;

    try {
      const [cash, future] = await Promise.all([
        this.#consumeWorker(workers[0], 'NSECM'),
        this.#consumeWorker(workers[1], 'NSEFO'),
      ]);
      return Object.freeze({ cash, future });
    } catch (error) {
      await Promise.allSettled(workers.map((worker) => worker.terminate()));
      throw error;
    }
  }

  #createWorker(market: ContractMarket, filePath: string): Worker {
    const input: ReplayWorkerInput = {
      market,
      filePath,
      selectedTokens: this.#state.selectedTokens(market),
      batchSize: this.#options.batchSize,
    };
    return new Worker(new URL('./market-data-worker.js', import.meta.url), {
      workerData: input,
    });
  }

  async #consumeWorker(
    worker: Worker,
    expectedMarket: ContractMarket,
  ): Promise<MarketDataStreamSummary> {
    return await new Promise<MarketDataStreamSummary>((resolve, reject) => {
      let settled = false;
      const fail = (error: Error): void => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      worker.on('message', (rawMessage: unknown) => {
        if (settled) return;
        try {
          const message = rawMessage as ReplayWorkerOutput;
          if (message.market !== expectedMarket) {
            throw new Error(
              `${expectedMarket} worker sent a mismatched market response`,
            );
          }

          if (message.type === 'batch') {
            const changed = this.#state.applyBatch(
              expectedMarket,
              message.quotes,
            );
            if (changed.length > 0) this.#options.onRowsChanged?.(changed);
            const acknowledgement: ReplayWorkerAcknowledgement = {
              type: 'ack',
            };
            worker.postMessage(acknowledgement);
            return;
          }
          if (message.type === 'error') {
            fail(new Error(message.message));
            return;
          }
          settled = true;
          resolve(message.summary);
        } catch (error) {
          fail(error instanceof Error ? error : new Error('worker failed'));
        }
      });
      worker.once('error', fail);
      worker.once('exit', (code) => {
        if (!settled) {
          fail(
            new Error(
              `${expectedMarket} worker exited before completion with code ${String(code)}`,
            ),
          );
        }
      });
    });
  }
}
