import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Dashboard } from '../src/App';
import {
  applyServerMessage,
  createInitialMarketState,
  withConnection,
} from '../src/market-state';
import { marketRow, snapshot } from './fixtures';

describe('Dashboard', () => {
  it('renders live connection, replay, and coverage summaries', () => {
    const baseMessage = snapshot(12);
    const message = {
      ...baseMessage,
      rows: [
        marketRow('ABC', {
          stockLtp: 100,
          futureLtp: 102,
          buySpread: 1.5,
          sellSpread: -1.8,
        }),
        ...baseMessage.rows.slice(1),
      ],
    };
    let state = applyServerMessage(
      createInitialMarketState(),
      message,
      new Date('2026-09-13T10:00:00Z').getTime(),
    ).state;
    state = applyServerMessage(state, {
      type: 'status',
      version: 1,
      sequence: 12,
      status: 'running',
      error: null,
    }).state;
    state = withConnection(state, 'connected');

    render(<Dashboard state={state} />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
      'See the spread.',
    );
    expect(screen.getAllByText('Live connection').length).toBeGreaterThan(0);
    expect(screen.getByText('Replay in motion')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getAllByText('1 / 228')).toHaveLength(3);
    expect(screen.getByText(/No order execution/u)).toBeTruthy();
  });

  it('shows a reconnect diagnostic without discarding the dashboard', () => {
    const state = {
      ...createInitialMarketState(),
      connection: 'reconnecting' as const,
      reconnectAttempt: 2,
      notice: 'Sequence gap detected after 4.',
    };
    render(<Dashboard state={state} />);
    expect(screen.getByRole('status').textContent).toContain('Sequence gap');
    expect(screen.getAllByText('Reconnecting').length).toBeGreaterThan(0);
    expect(screen.getByText('2')).toBeTruthy();
  });
});
