import type { ContractMarket } from '../contracts.js';
import type {
  MarketDataQuote,
  MarketDataStreamSummary,
} from './market-data.js';

export type ReplayWorkerInput = Readonly<{
  market: ContractMarket;
  filePath: string;
  selectedTokens: readonly number[];
  batchSize: number;
}>;

export type ReplayWorkerOutput =
  | Readonly<{
      type: 'batch';
      market: ContractMarket;
      quotes: readonly MarketDataQuote[];
    }>
  | Readonly<{
      type: 'complete';
      market: ContractMarket;
      summary: MarketDataStreamSummary;
    }>
  | Readonly<{
      type: 'error';
      market: ContractMarket;
      message: string;
    }>;

export type ReplayWorkerAcknowledgement = Readonly<{
  type: 'ack';
}>;
