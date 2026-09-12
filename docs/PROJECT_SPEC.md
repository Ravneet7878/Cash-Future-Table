# Cash–Future Table: Project Specification

## Purpose

Build a local-first, display-only Cash–Future Table for every NSE cash stock that has a corresponding NSE stock future. PostgreSQL stores contract reference data; quote state remains in backend memory and is streamed to a React/AG Grid frontend. There is no order execution or trading functionality.

## Repository and checkpoint workflow

The repository is one pnpm workspace with separate top-level `backend` and `frontend` applications. External source files remain outside the repository and Docker image layers. Containerized readers mount `DATA_DIR` read-only and must never modify raw files.

After every component: run its tests, lint, strict typecheck, and build; update `docs/PROGRESS.md`; commit and push the verified checkpoint; report behavior and limitations; then stop for user review.

## Nine build components

### 1. Backend Foundation

- Create the root workspace and `backend`.
- Add TypeScript, Express, PostgreSQL connectivity, migrations, logging, configuration validation, and health endpoints.
- Add PostgreSQL and backend Docker services.
- Verify startup, database connectivity, tests, type checks, and production build.

### 2. Contract Ingestion

- Parse the two headerless, whitespace-delimited, 14-field contract files from external `DATA_DIR`.
- Store NSECM `EQUITY` and NSEFO `FUTSTK` records only.
- Convert NSECM expiry `-1` to SQL `NULL` and FUTSTK epoch seconds to a UTC calendar date.
- Import both segments transactionally and idempotently after migrations and before HTTP listens.
- Validate exactly 4,433 cash contracts and 647 futures contracts in the supplied files.
- Reject malformed data with filename and line details; preserve prior data on failure.

### 3. Contract Universe

- Select the absolute minimum FUTSTK expiry per symbol; do not reinterpret “nearest” relative to the current date.
- Join futures to NSECM cash contracts by exact symbol.
- Produce exactly 228 unique rows, including all 18 `NSETEST` symbols.
- Commit the database query and service contract.

### 4. Market Replay Engine

- Use two worker threads: one for NSECM and one for NSEFO.
- Stream both large market-data files without loading them fully into memory.
- Filter to selected tokens and send bounded batches to the main process.
- Keep prices internally in paise and divide by 100 only at the display/protocol boundary.
- Convert a zero bid or ask to `null` (unavailable).
- Accept the newest timestamp; when timestamps are equal, the later file row wins.
- Calculate Buy Spread as Future Bid minus Stock Ask and Sell Spread as Stock Bid minus Future Ask, propagating `null` when either input is unavailable.
- Verify bounded memory and responsive one-second timers.

### 5. WebSocket Backend

- Start one global replay when the first client connects.
- Send a full 228-row snapshot to every newly connected client.
- Publish only changed rows as deltas once per second.
- Send `waiting`, `running`, `complete`, and `error` statuses.
- Flush final changes and retain the final state after replay completes.
- Define the committed schema in `docs/WEBSOCKET_PROTOCOL.md`.

### 6. Frontend Foundation

- Create the independent React/Vite application only after the WebSocket protocol is committed.
- Implement snapshot replacement, sequence-aware deltas, reconnect handling, and connection/replay status.
- Test frontend state behavior before adding AG Grid.

### 7. AG Grid Table

Display exactly these five columns:

1. Symbol
2. Stock LTP
3. Future LTP
4. Buy Spread
5. Sell Spread

Use symbol as the stable row ID. Apply deltas through AG Grid transactions. Format prices with two decimals and render `null` as an em dash. Enable sorting, filtering, resizing, and responsive sizing. Retain all 228 rows, including test symbols without future quotes.

### 8. Docker Integration

- Run PostgreSQL, backend, and frontend through Docker Compose.
- Mount external `DATA_DIR` read-only.
- Add complete health checks, environment templates, root commands, and operational documentation.
- Verify `docker compose up --build` starts the complete application.

### 9. Final QA

- Run unit, PostgreSQL integration, WebSocket integration, and Playwright end-to-end tests.
- Verify counts, absolute-minimum expiry selection, missing-data behavior, one-second updates, reconnection, and final-state retention.
- Run the complete application against all supplied files.
- Confirm that no order execution or trading functionality exists.

## Confirmed technical decisions

- Separate `backend` and `frontend` folders in a TypeScript/pnpm workspace.
- Express, `pg`, and standard WebSockets; React, Vite, and AG Grid Community.
- PostgreSQL stores contracts; quotes remain in memory.
- External source files stay outside version control and are read-only to containers.
- Absolute minimum expiry and exactly 228 contract-paired symbols, including 18 `NSETEST` symbols.
- Two market-data worker threads.
- Prices use paise internally and are divided by 100 for display.
- Zero bid or ask becomes `null`.
- Newest timestamp wins; the later row wins ties.
- The first WebSocket client starts the single replay.
- Full snapshot on connection and changed-row deltas every second.
- Final replay state remains available.
- The grid has exactly the five specified columns.
- Review checkpoint after every component.

## Current Component 2 runtime contract

Configuration is validated before startup. `DATA_DIR` must be absolute, and contract filenames must be plain filenames without directory traversal. Startup runs checksum-protected migrations, parses both files, atomically replaces both stored market segments in bounded batches, and starts HTTP only after import commits. Logs report counts without the external directory path.

`app.contracts` stores `market`, `token`, `instrument_type`, `symbol`, nullable `expiry_date`, and `contract_name`. Its primary key is `(market, token)`, with an index on `(symbol, instrument_type, expiry_date)` for the next component's universe query.

Secrets exist only in ignored `.env` or deployment secret injection. `.env.example`, Compose, source, tests, and documentation contain no real credentials.

## Component 2 exclusions

Component 2 does not select the 228-row contract universe, parse market-data files, create workers, hold quotes, calculate spreads, implement WebSockets/replay, or add frontend code.
