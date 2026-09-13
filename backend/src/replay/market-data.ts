import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';

export type MarketDataQuote = Readonly<{
  token: number;
  timestamp: number;
  sourceRow: number;
  bidPaise: number | null;
  askPaise: number | null;
  ltpPaise: number;
}>;

export type MarketDataStreamSummary = Readonly<{
  linesRead: number;
  matchedRows: number;
  batches: number;
  maximumBatchSize: number;
}>;

export type StreamMarketDataOptions = {
  filePath: string;
  selectedTokens: ReadonlySet<number>;
  batchSize: number;
  onBatch: (batch: readonly MarketDataQuote[]) => void | Promise<void>;
};

export class MarketDataParseError extends Error {
  public constructor(
    public readonly file: string,
    public readonly line: number,
    message: string,
  ) {
    super(`${file}:${String(line)}: ${message}`);
    this.name = 'MarketDataParseError';
  }
}

const FIELD_COUNT = 5;

export function parseMarketDataLine(
  line: string,
  file: string,
  lineNumber: number,
): MarketDataQuote {
  const fields = line.split(',');
  if (fields.length !== FIELD_COUNT) {
    throw new MarketDataParseError(
      file,
      lineNumber,
      `expected ${String(FIELD_COUNT)} comma-delimited fields, received ${String(fields.length)}`,
    );
  }

  const [tokenText, timestampText, bidText, askText, ltpText] = fields;
  if (
    tokenText === undefined ||
    timestampText === undefined ||
    bidText === undefined ||
    askText === undefined ||
    ltpText === undefined
  ) {
    throw new MarketDataParseError(
      file,
      lineNumber,
      'required market-data fields are missing',
    );
  }

  const token = parseInteger(tokenText, 'token', file, lineNumber);
  const timestamp = parseInteger(timestampText, 'timestamp', file, lineNumber);
  const bidPaise = parseInteger(bidText, 'bid', file, lineNumber);
  const askPaise = parseInteger(askText, 'ask', file, lineNumber);
  const ltpPaise = parseInteger(ltpText, 'ltp', file, lineNumber);

  if (token <= 0) {
    throw new MarketDataParseError(file, lineNumber, 'token must be positive');
  }
  if (timestamp < 0 || bidPaise < 0 || askPaise < 0 || ltpPaise < 0) {
    throw new MarketDataParseError(
      file,
      lineNumber,
      'timestamp and prices must be non-negative',
    );
  }

  return Object.freeze({
    token,
    timestamp,
    sourceRow: lineNumber,
    bidPaise: bidPaise === 0 ? null : bidPaise,
    askPaise: askPaise === 0 ? null : askPaise,
    ltpPaise,
  });
}

export async function streamMarketDataFile({
  filePath,
  selectedTokens,
  batchSize,
  onBatch,
}: StreamMarketDataOptions): Promise<MarketDataStreamSummary> {
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
    throw new RangeError('batchSize must be a positive safe integer');
  }

  const file = path.basename(filePath);
  const input = createReadStream(filePath, { encoding: 'utf8' });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let batch: MarketDataQuote[] = [];
  let linesRead = 0;
  let matchedRows = 0;
  let batches = 0;
  let maximumBatchSize = 0;

  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    const readyBatch = batch;
    batch = [];
    batches += 1;
    maximumBatchSize = Math.max(maximumBatchSize, readyBatch.length);
    await onBatch(readyBatch);
  };

  try {
    for await (const line of lines) {
      linesRead += 1;
      const quote = parseMarketDataLine(line, file, linesRead);
      if (!selectedTokens.has(quote.token)) continue;

      batch.push(quote);
      matchedRows += 1;
      if (batch.length === batchSize) await flush();
    }
    await flush();
  } catch (error) {
    if (error instanceof MarketDataParseError) throw error;
    throw new Error(
      `${file}:${String(Math.max(linesRead, 1))}: unable to stream market-data file`,
      { cause: error },
    );
  } finally {
    lines.close();
    input.destroy();
  }

  return Object.freeze({
    linesRead,
    matchedRows,
    batches,
    maximumBatchSize,
  });
}

function parseInteger(
  value: string,
  field: string,
  file: string,
  line: number,
): number {
  if (!/^\d+$/u.test(value)) {
    throw new MarketDataParseError(file, line, `${field} must be an integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new MarketDataParseError(
      file,
      line,
      `${field} is outside the safe integer range`,
    );
  }
  return parsed;
}
