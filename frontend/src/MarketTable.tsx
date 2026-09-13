import {
  AllCommunityModule,
  themeQuartz,
  type ColDef,
  type GetRowIdParams,
  type GridApi,
  type GridReadyEvent,
  type ValueFormatterParams,
} from 'ag-grid-community';
import { AgGridProvider, AgGridReact } from 'ag-grid-react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { MarketChange, MarketState } from './market-state';
import type { MarketRow } from './protocol';

const gridTheme = themeQuartz.withParams({
  accentColor: '#35bea6',
  backgroundColor: '#ffffff',
  borderColor: '#dfe7e2',
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  fontSize: 13,
  foregroundColor: '#10231e',
  headerBackgroundColor: '#f4f7f2',
  headerFontWeight: 750,
  headerTextColor: '#52635d',
  oddRowBackgroundColor: '#fbfcfa',
  rowHoverColor: '#eff8f3',
  wrapperBorder: false,
});

const priceFormatter = (
  params: ValueFormatterParams<MarketRow, number | null>,
) => formatMarketValue(params.value);

export const marketColumnDefs: readonly ColDef<MarketRow>[] = [
  {
    field: 'symbol',
    headerName: 'Symbol',
    minWidth: 170,
    flex: 1.25,
    filter: 'agTextColumnFilter',
    cellClass: 'symbol-cell',
  },
  {
    field: 'stockLtp',
    headerName: 'Stock LTP',
    minWidth: 150,
    flex: 1,
    filter: 'agNumberColumnFilter',
    valueFormatter: priceFormatter,
    cellClass: 'numeric-cell',
  },
  {
    field: 'futureLtp',
    headerName: 'Future LTP',
    minWidth: 150,
    flex: 1,
    filter: 'agNumberColumnFilter',
    valueFormatter: priceFormatter,
    cellClass: 'numeric-cell',
  },
  {
    field: 'buySpread',
    headerName: 'Buy Spread',
    minWidth: 150,
    flex: 1,
    filter: 'agNumberColumnFilter',
    valueFormatter: priceFormatter,
    cellClass: spreadCellClass,
  },
  {
    field: 'sellSpread',
    headerName: 'Sell Spread',
    minWidth: 150,
    flex: 1,
    filter: 'agNumberColumnFilter',
    valueFormatter: priceFormatter,
    cellClass: spreadCellClass,
  },
];

export const marketDefaultColDef: ColDef<MarketRow> = {
  sortable: true,
  resizable: true,
  floatingFilter: true,
  enableCellChangeFlash: true,
  suppressHeaderMenuButton: false,
};

export function MarketTable({ state }: Readonly<{ state: MarketState }>) {
  const [query, setQuery] = useState('');
  const apiRef = useRef<GridApi<MarketRow> | null>(null);
  const appliedChangeRef = useRef<MarketChange | null>(null);
  const rows = useMemo(() => [...state.rows.values()], [state.rows]);

  const onGridReady = useCallback(
    (event: GridReadyEvent<MarketRow>) => {
      apiRef.current = event.api;
      event.api.setGridOption('rowData', rows);
      appliedChangeRef.current = state.lastChange;
    },
    [rows, state.lastChange],
  );

  useEffect(() => {
    const api = apiRef.current;
    const change = state.lastChange;
    if (
      api === null ||
      change === null ||
      change === appliedChangeRef.current
    ) {
      return;
    }

    syncMarketGrid(api, change, rows);
    appliedChangeRef.current = change;
  }, [rows, state.lastChange]);

  return (
    <section className="market-table-panel" aria-labelledby="table-title">
      <div className="market-table-heading">
        <div>
          <span className="micro-label">Live universe</span>
          <h2 id="table-title">Cash–future table</h2>
          <p>Sort, filter, and resize the complete nearest-expiry universe.</p>
        </div>
        <div className="table-tools">
          <label className="table-search">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Search symbols</span>
            <input
              type="search"
              value={query}
              placeholder="Search symbols"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <span className="row-count">
            <SlidersHorizontal size={15} aria-hidden="true" />
            {state.hasSnapshot ? rows.length.toLocaleString('en-IN') : '—'} rows
          </span>
        </div>
      </div>

      <div className="market-grid" data-testid="market-grid">
        <AgGridProvider modules={[AllCommunityModule]}>
          <AgGridReact<MarketRow>
            columnDefs={[...marketColumnDefs]}
            defaultColDef={marketDefaultColDef}
            getRowId={getMarketRowId}
            loading={!state.hasSnapshot}
            onGridReady={onGridReady}
            quickFilterText={query}
            theme={gridTheme}
            animateRows={false}
          />
        </AgGridProvider>
      </div>
      <p className="table-footnote">
        Prices and spreads are in rupees. An em dash means the quote is
        unavailable; no value is inferred.
      </p>
    </section>
  );
}

export function syncMarketGrid(
  api: Pick<GridApi<MarketRow>, 'applyTransaction' | 'setGridOption'>,
  change: MarketChange,
  allRows: readonly MarketRow[],
): void {
  if (change.kind === 'snapshot') {
    api.setGridOption('rowData', [...allRows]);
    return;
  }
  api.applyTransaction({ update: [...change.rows] });
}

export function formatMarketValue(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function getMarketRowId(params: GetRowIdParams<MarketRow>): string {
  return params.data.symbol;
}

function spreadCellClass(params: { value: number | null | undefined }): string {
  if (params.value === null || params.value === undefined) {
    return 'numeric-cell unavailable-cell';
  }
  return params.value >= 0
    ? 'numeric-cell positive-spread'
    : 'numeric-cell negative-spread';
}
