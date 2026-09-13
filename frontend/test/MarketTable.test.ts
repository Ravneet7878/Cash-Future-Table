import type { GridApi } from 'ag-grid-community';
import { describe, expect, it, vi } from 'vitest';

import {
  formatMarketValue,
  getMarketRowId,
  marketColumnDefs,
  marketDefaultColDef,
  syncMarketGrid,
} from '../src/MarketTable';
import type { MarketChange } from '../src/market-state';
import type { MarketRow } from '../src/protocol';
import { marketRow } from './fixtures';

describe('market table contract', () => {
  it('defines exactly the five approved sortable, filterable columns', () => {
    expect(marketColumnDefs.map((column) => column.headerName)).toEqual([
      'Symbol',
      'Stock LTP',
      'Future LTP',
      'Buy Spread',
      'Sell Spread',
    ]);
    expect(marketColumnDefs.map((column) => column.field)).toEqual([
      'symbol',
      'stockLtp',
      'futureLtp',
      'buySpread',
      'sellSpread',
    ]);
    expect(
      marketColumnDefs.every((column) => column.filter !== undefined),
    ).toBe(true);
    expect(marketDefaultColDef).toMatchObject({
      sortable: true,
      resizable: true,
      floatingFilter: true,
    });
  });

  it('uses the symbol as its stable row ID', () => {
    expect(
      getMarketRowId({ data: marketRow('ABC') } as Parameters<
        typeof getMarketRowId
      >[0]),
    ).toBe('ABC');
  });

  it('formats values to two decimals and null as an em dash', () => {
    expect(formatMarketValue(1234.5)).toBe('1,234.50');
    expect(formatMarketValue(-1.256)).toBe('-1.26');
    expect(formatMarketValue(null)).toBe('—');
  });
});

describe('grid synchronization', () => {
  function gridApi() {
    return {
      applyTransaction: vi.fn(),
      setGridOption: vi.fn(),
    } as unknown as Pick<
      GridApi<MarketRow>,
      'applyTransaction' | 'setGridOption'
    >;
  }

  it('replaces all grid rows for an authoritative snapshot', () => {
    const api = gridApi();
    const allRows = [marketRow('ABC'), marketRow('XYZ')];
    const change: MarketChange = {
      kind: 'snapshot',
      rows: allRows,
      sequence: 7,
    };

    syncMarketGrid(api, change, allRows);

    expect(api.setGridOption).toHaveBeenCalledWith('rowData', allRows);
    expect(api.applyTransaction).not.toHaveBeenCalled();
  });

  it('applies only delta rows through a grid transaction', () => {
    const api = gridApi();
    const changed = marketRow('ABC', { futureLtp: 123.45 });
    const allRows = [changed, marketRow('XYZ')];
    const change: MarketChange = {
      kind: 'delta',
      rows: [changed],
      sequence: 8,
    };

    syncMarketGrid(api, change, allRows);

    expect(api.applyTransaction).toHaveBeenCalledWith({ update: [changed] });
    expect(api.setGridOption).not.toHaveBeenCalled();
  });
});
