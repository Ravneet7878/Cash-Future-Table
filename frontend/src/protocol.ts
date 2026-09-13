export const WEBSOCKET_PROTOCOL_VERSION = 1 as const;
export const EXPECTED_UNIVERSE_SIZE = 228;

export type ReplayStatus = 'waiting' | 'running' | 'complete' | 'error';

export type MarketRow = Readonly<{
  symbol: string;
  stockLtp: number | null;
  futureLtp: number | null;
  buySpread: number | null;
  sellSpread: number | null;
}>;

export type SnapshotMessage = Readonly<{
  type: 'snapshot';
  version: typeof WEBSOCKET_PROTOCOL_VERSION;
  sequence: number;
  rows: readonly MarketRow[];
}>;

export type DeltaMessage = Readonly<{
  type: 'delta';
  version: typeof WEBSOCKET_PROTOCOL_VERSION;
  sequence: number;
  rows: readonly MarketRow[];
}>;

export type StatusMessage = Readonly<{
  type: 'status';
  version: typeof WEBSOCKET_PROTOCOL_VERSION;
  sequence: number;
  status: ReplayStatus;
  error: string | null;
}>;

export type ServerMessage = SnapshotMessage | DeltaMessage | StatusMessage;

export class ProtocolError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ProtocolError';
  }
}

export function parseServerMessage(raw: unknown): ServerMessage {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      throw new ProtocolError('The server sent invalid JSON.');
    }
  }

  if (!isRecord(value)) throw new ProtocolError('Expected a message object.');
  if (value.version !== WEBSOCKET_PROTOCOL_VERSION) {
    throw new ProtocolError('Unsupported WebSocket protocol version.');
  }
  const sequence = readSequence(value.sequence);

  if (value.type === 'snapshot') {
    const rows = readRows(value.rows);
    if (rows.length !== EXPECTED_UNIVERSE_SIZE) {
      throw new ProtocolError(
        `Expected ${String(EXPECTED_UNIVERSE_SIZE)} snapshot rows.`,
      );
    }
    return Object.freeze({
      type: 'snapshot',
      version: WEBSOCKET_PROTOCOL_VERSION,
      sequence,
      rows,
    });
  }

  if (value.type === 'delta') {
    const rows = readRows(value.rows);
    if (rows.length === 0) {
      throw new ProtocolError('A delta must contain at least one row.');
    }
    return Object.freeze({
      type: 'delta',
      version: WEBSOCKET_PROTOCOL_VERSION,
      sequence,
      rows,
    });
  }

  if (value.type === 'status') {
    if (!isReplayStatus(value.status)) {
      throw new ProtocolError('Unknown replay status.');
    }
    if (value.error !== null && typeof value.error !== 'string') {
      throw new ProtocolError('Status error must be text or null.');
    }
    if (value.status === 'error' && value.error === null) {
      throw new ProtocolError('Error status requires a diagnostic.');
    }
    if (value.status !== 'error' && value.error !== null) {
      throw new ProtocolError('Only error status may include a diagnostic.');
    }
    return Object.freeze({
      type: 'status',
      version: WEBSOCKET_PROTOCOL_VERSION,
      sequence,
      status: value.status,
      error: value.error,
    });
  }

  throw new ProtocolError('Unknown WebSocket message type.');
}

function readRows(value: unknown): readonly MarketRow[] {
  if (!Array.isArray(value)) throw new ProtocolError('Rows must be an array.');
  const symbols = new Set<string>();
  return Object.freeze(
    value.map((row, index) => {
      if (!isRecord(row)) {
        throw new ProtocolError(`Row ${String(index + 1)} must be an object.`);
      }
      if (typeof row.symbol !== 'string' || row.symbol.trim().length === 0) {
        throw new ProtocolError(`Row ${String(index + 1)} has no symbol.`);
      }
      if (symbols.has(row.symbol)) {
        throw new ProtocolError(`Duplicate symbol ${row.symbol}.`);
      }
      symbols.add(row.symbol);
      return Object.freeze({
        symbol: row.symbol,
        stockLtp: readPrice(row.stockLtp, index, 'stockLtp'),
        futureLtp: readPrice(row.futureLtp, index, 'futureLtp'),
        buySpread: readPrice(row.buySpread, index, 'buySpread'),
        sellSpread: readPrice(row.sellSpread, index, 'sellSpread'),
      });
    }),
  );
}

function readPrice(
  value: unknown,
  rowIndex: number,
  field: string,
): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ProtocolError(
      `Row ${String(rowIndex + 1)} has an invalid ${field}.`,
    );
  }
  return value;
}

function readSequence(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new ProtocolError('Sequence must be a non-negative integer.');
  }
  return value as number;
}

function isReplayStatus(value: unknown): value is ReplayStatus {
  return (
    value === 'waiting' ||
    value === 'running' ||
    value === 'complete' ||
    value === 'error'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
