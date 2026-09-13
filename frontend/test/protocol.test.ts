import { describe, expect, it } from 'vitest';

import { parseServerMessage, ProtocolError } from '../src/protocol';
import { marketRow, snapshot } from './fixtures';

describe('parseServerMessage', () => {
  it('parses a complete protocol snapshot', () => {
    expect(parseServerMessage(JSON.stringify(snapshot(7)))).toMatchObject({
      type: 'snapshot',
      version: 1,
      sequence: 7,
    });
  });

  it('parses a valid row delta and status', () => {
    expect(
      parseServerMessage({
        type: 'delta',
        version: 1,
        sequence: 1,
        rows: [marketRow('ABC', { stockLtp: 123.45 })],
      }),
    ).toMatchObject({ type: 'delta', sequence: 1 });
    expect(
      parseServerMessage({
        type: 'status',
        version: 1,
        sequence: 1,
        status: 'running',
        error: null,
      }),
    ).toEqual({
      type: 'status',
      version: 1,
      sequence: 1,
      status: 'running',
      error: null,
    });
  });

  it.each([
    ['invalid JSON', '{'],
    ['wrong protocol', { ...snapshot(), version: 2 }],
    ['short snapshot', { ...snapshot(), rows: [] }],
    [
      'non-finite price',
      {
        type: 'delta',
        version: 1,
        sequence: 1,
        rows: [marketRow('ABC', { stockLtp: Number.NaN })],
      },
    ],
    [
      'invalid error status',
      {
        type: 'status',
        version: 1,
        sequence: 0,
        status: 'error',
        error: null,
      },
    ],
  ])('rejects %s', (_label, message) => {
    expect(() => parseServerMessage(message)).toThrow(ProtocolError);
  });
});
