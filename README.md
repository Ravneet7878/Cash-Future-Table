# Cash–Future Table

Cash–Future Table is a local-first, read-only market-data application for comparing NSE cash equities with their selected stock futures. It imports the supplied contract universe into PostgreSQL, replays large cash and futures feeds through bounded worker threads, publishes live WebSocket updates, and displays all 228 paired symbols in a professional AG Grid dashboard.

The application calculates:

- **Buy Spread:** Future Bid − Stock Ask
- **Sell Spread:** Stock Bid − Future Ask

Prices are shown in rupees with two decimal places. Missing bid or ask values remain unavailable and are displayed as an em dash. The application contains no order entry, execution, brokerage, portfolio, or other trading functionality.

## Architecture

- **PostgreSQL 17:** stores imported NSECM and NSEFO contract reference data.
- **Node.js backend:** validates configuration, applies migrations, imports contracts, selects the 228-symbol universe, and serves health and WebSocket endpoints.
- **Replay workers:** independently stream NSECM and NSEFO market files without loading them into memory.
- **React frontend:** validates the versioned WebSocket protocol, handles snapshots, sequenced deltas, and reconnects, and renders the live table with AG Grid Community.
- **Nginx frontend container:** serves the production assets and proxies the browser's same-origin `/ws` connection to the backend.

External source files are never copied into Git or an image. Docker Compose mounts their host directory read-only into the backend container.

## Requirements

- Docker Desktop with Docker Compose
- Four supplied contract-reference and market-data files in one external directory
- Node.js 22.12+ and pnpm 11+ only when running or testing outside Docker

## Data files

The default filenames are:

```text
nse_cm_ref_contract_master.csv
nse_fo_ref_contract_master.csv
nsecm_market_data.csv
nsefo_market_data.csv
```

Contract files are headerless, whitespace-delimited, and contain these 14 fields:

```text
token streamId instrumentType symbol expiryDate strikePrice optionType lotSize lotSize2 tickSize freezeQuantity minPriceRange maxPriceRange contractName
```

Only NSECM `EQUITY` and NSEFO `FUTSTK` records are retained. The supplied reference files contain 4,433 eligible cash contracts and 647 eligible futures contracts.

Market-data files are headerless CSV records:

```text
token,timestamp,bid,ask,ltp
```

Market prices remain integer paise inside the replay engine and are converted to rupees only at the WebSocket boundary.

## Configuration

Create the ignored environment file:

```sh
cp .env.example .env
```

Set these required values in `.env`:

- `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` for the local database.
- `DATABASE_URL` for backend commands executed directly on the host.
- `DATA_DIR` to the absolute host directory containing all four source files.

The provided filenames, replay batch size, WebSocket path, database pool, timeouts, and host-development settings can also be adjusted in `.env`. Filename settings accept plain filenames only; `DATA_DIR` must be absolute. The packaged stack deliberately binds fixed internal service ports and publishes them only on localhost.

Secrets belong only in ignored `.env` files or a deployment secret manager. The tracked `.env.example` deliberately contains blank credential values. Backend environment access is centralized in `backend/src/config.ts`; browser environment access is centralized in `frontend/src/config.ts`.

## Run the complete application

Build and start PostgreSQL, the backend, and the frontend:

```sh
pnpm docker:up
```

The same operation can be run directly with `docker compose up --build`.

After all three services report healthy, open:

- Dashboard: `http://localhost:8080`
- Frontend health: `http://localhost:8080/healthz`
- Backend liveness: `http://localhost:3000/health/live`
- Backend readiness: `http://localhost:3000/health/ready`

The first browser connection starts the single global replay. New and reconnected clients immediately receive the current complete 228-row snapshot. Changed rows are published once per second, remaining changes are flushed at completion, and the final state stays available until the backend restarts.

Useful container commands:

```sh
pnpm docker:logs
pnpm docker:down
pnpm docker:config
```

`docker compose down` preserves the PostgreSQL volume. Running `docker compose down --volumes` also deletes the imported database and should be used only when a clean database reset is intended.

## Dashboard behavior

The interface shows connection and replay state, contract and quote coverage, sequence freshness, and exactly these table columns:

1. Symbol
2. Stock LTP
3. Future LTP
4. Buy Spread
5. Sell Spread

All columns support sorting, typed filtering, resizing, and responsive sizing. Symbol search is available above the table. Symbol is the stable row ID, snapshots replace the authoritative grid data, and accepted deltas update changed rows through AG Grid transactions. All 228 symbols remain in state, including the 18 `NSETEST` symbols without future quotes.

## Data and replay guarantees

- The selected future is the absolute minimum FUTSTK expiry for each symbol; expiry selection is not relative to the current date.
- An equal minimum expiry is resolved deterministically with the lower future token.
- Cash and futures are joined by exact symbol.
- Zero bid or ask is converted to unavailable; zero LTP remains valid source data.
- A newer timestamp wins; for equal timestamps, the later source-file row wins.
- Each worker permits only one bounded batch in flight.
- Invalid source data reports the filename and line and prevents readiness.
- Contract replacement is transactional and idempotent.
- Quote state remains in memory and is retained after replay completion.

The exact message schemas and sequencing rules are documented in [docs/WEBSOCKET_PROTOCOL.md](docs/WEBSOCKET_PROTOCOL.md).

## Local development

Install dependencies and start PostgreSQL:

```sh
pnpm install
docker compose up -d postgres
```

Run the backend and frontend in separate terminals:

```sh
pnpm --filter @cash-future/backend dev
pnpm --filter @cash-future/frontend dev
```

The Vite development server is available at `http://localhost:5173`. Its configured `VITE_WEBSOCKET_URL` connects directly to the backend.

## Verification

Run formatting checks, linting, strict type checks, all unit and integration tests, and both production builds:

```sh
pnpm check
```

Validate the resolved container configuration:

```sh
pnpm docker:config
```

PostgreSQL-backed and supplied-file tests run when `DATABASE_URL` and `DATA_DIR` point to available resources:

```sh
DATABASE_URL=postgresql://... DATA_DIR=/absolute/path/to/data pnpm --filter @cash-future/backend test
```

Detailed verification history is recorded in [docs/PROGRESS.md](docs/PROGRESS.md), and the approved technical contract is retained in [docs/PROJECT_SPEC.md](docs/PROJECT_SPEC.md).

## Known limitations

- Source data is replayed from files; this is not a live exchange connection.
- The production frontend bundle is approximately 1.35 MB before gzip and can benefit from future code splitting.
- TLS and public authentication are deployment concerns; the supplied Compose stack binds its ports to localhost.
- Playwright browser automation and the final end-to-end acceptance pass remain outstanding.
