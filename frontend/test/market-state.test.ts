import { describe, expect, it } from 'vitest';

import {
  applyServerMessage,
  createInitialMarketState,
} from '../src/market-state';
import { marketRow, snapshot } from './fixtures';

describe('market state', () => {
  it('replaces all rows from an authoritative snapshot', () => {
    const first = applyServerMessage(
      createInitialMarketState(),
      snapshot(4),
      10,
    );
    const baseReplacement = snapshot(8);
    const replacement = {
      ...baseReplacement,
      rows: [
        marketRow('REPLACED', { stockLtp: 101.25 }),
        ...baseReplacement.rows.slice(1),
      ],
    };
    const second = applyServerMessage(first.state, replacement, 20);

    expect(second.reconnect).toBe(false);
    expect(second.state.sequence).toBe(8);
    expect(second.state.rows).toHaveLength(228);
    expect(second.state.rows.has('SYMBOL000')).toBe(false);
    expect(second.state.rows.get('REPLACED')?.stockLtp).toBe(101.25);
    expect(second.state.updatedAt).toBe(20);
  });

  it('applies only the next delta and ignores stale deltas', () => {
    const initial = applyServerMessage(
      createInitialMarketState(),
      snapshot(),
    ).state;
    const next = applyServerMessage(initial, {
      type: 'delta',
      version: 1,
      sequence: 1,
      rows: [marketRow('SYMBOL000', { futureLtp: 205.4 })],
    });
    const stale = applyServerMessage(next.state, {
      type: 'delta',
      version: 1,
      sequence: 1,
      rows: [marketRow('SYMBOL000', { futureLtp: 999 })],
    });

    expect(next.state.rows.get('SYMBOL000')?.futureLtp).toBe(205.4);
    expect(stale.state).toBe(next.state);
  });

  it('requests a reconnect for missing snapshots and sequence gaps', () => {
    const delta = {
      type: 'delta' as const,
      version: 1 as const,
      sequence: 2,
      rows: [marketRow('SYMBOL000')],
    };
    expect(
      applyServerMessage(createInitialMarketState(), delta).reconnect,
    ).toBe(true);
    const withSnapshot = applyServerMessage(
      createInitialMarketState(),
      snapshot(),
    ).state;
    expect(applyServerMessage(withSnapshot, delta)).toMatchObject({
      reconnect: true,
      state: { connection: 'reconnecting' },
    });
  });

  it('tracks replay status without advancing the data sequence', () => {
    const current = applyServerMessage(
      createInitialMarketState(),
      snapshot(3),
    ).state;
    const result = applyServerMessage(current, {
      type: 'status',
      version: 1,
      sequence: 3,
      status: 'complete',
      error: null,
    });
    expect(result.state).toMatchObject({ sequence: 3, replay: 'complete' });
  });
});
