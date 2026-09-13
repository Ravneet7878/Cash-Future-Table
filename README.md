# Cash–Future Table

Components 1–7 provide the complete backend pipeline and a professional React/Vite market-data interface. The responsive Basis dashboard consumes the versioned WebSocket stream, validates every message, replaces authoritative snapshots, applies sequenced deltas, reconnects safely, and presents the full contract universe in AG Grid Community.

## Requirements

- Node.js 22.12+
- pnpm 11+
- Docker Desktop for the container workflow
- The four supplied contract-reference and market-data files in an external directory

## External data files

The application expects these exact default filenames:

- `nse_cm_ref_contract_master.csv`
- `nse_fo_ref_contract_master.csv`
- `nsecm_market_data.csv`
- `nsefo_market_data.csv`

Both files are headerless and contain 14 whitespace-delimited fields per line, in this order:

```text
token streamId instrumentType symbol expiryDate strikePrice optionType lotSize lotSize2 tickSize freezeQuantity minPriceRange maxPriceRange contractName
```

Only NSECM `EQUITY` and NSEFO `FUTSTK` records are retained. The supplied complete files produce 4,433 cash contracts and 647 futures contracts. Source files remain outside Git and are mounted read-only in Docker.

The two market-data files are also headerless and use comma-delimited `token,timestamp,bid,ask,ltp` rows. Prices are integer paise. Their filenames and the bounded replay batch size can be changed with `NSE_CM_MARKET_DATA_FILE`, `NSE_FO_MARKET_DATA_FILE`, and `REPLAY_BATCH_SIZE`.

## Configuration

Create the ignored local environment file:

```sh
cp .env.example .env
```

Fill the blank PostgreSQL values and set `DATA_DIR` to the absolute directory containing the four files. Contract and market-data filenames can be changed through their corresponding `NSE_*_FILE` variables, but each value must be a filename without directory components.

Secrets belong only in ignored `.env` for local development or in a deployment secret manager. Never commit `.env`.

All backend runtime configuration is defined and validated in `backend/src/config.ts`; it is the only production source file that reads `process.env`. Browser configuration is isolated in `frontend/src/config.ts`, which validates `VITE_WEBSOCKET_URL` and otherwise derives a same-origin `ws://` or `wss://` endpoint. `.env` and `.env.example` carry the same variable names, while `.env.example` deliberately leaves secret values blank.

## Local development

Start PostgreSQL, then run the backend and frontend in separate terminals:

```sh
docker compose up -d postgres
pnpm install
pnpm --filter @cash-future/backend dev
pnpm --filter @cash-future/frontend dev
```

Startup performs this sequence before accepting HTTP traffic:

1. Validate environment configuration.
2. Connect to PostgreSQL and apply checksum-protected SQL migrations.
3. Stream and validate both external contract files.
4. Replace both stored market segments in one transaction using bounded insert batches.
5. Load and validate the 228-row cash/future contract universe.
6. Start the Express server only after the import and universe validation succeed.

Malformed input reports its filename and line. Parsing or database failure leaves previously committed contracts intact and prevents the HTTP server from becoming ready.

## Contract universe

The `app.contract_universe` PostgreSQL view ranks NSEFO `FUTSTK` contracts independently for each symbol by expiry date, selects the absolute minimum expiry, and joins it to the exact NSECM `EQUITY` symbol. Expiry selection is deliberately not relative to the current date. If two futures have the same minimum expiry, the lower token is the deterministic tie-breaker.

The backend service exposes each row as a read-only `{ symbol, cashToken, futureToken, futureExpiry }` entry ordered by symbol. Startup rejects malformed tokens or dates, duplicate symbols, any row count other than 228, or any result that does not contain exactly 18 symbols ending in `NSETEST`. The supplied files produce 228 unique rows, including all 18 test symbols.

## Market replay engine

`MarketReplayEngine` runs NSECM and NSEFO readers in separate worker threads. Each worker streams its file line by line, filters to the selected universe tokens, and waits for a main-thread acknowledgement after every bounded batch. This keeps at most one batch per worker in flight and prevents the worker message queue from growing with file size.

Quote state remains in memory and in integer paise. A zero bid or ask becomes unavailable (`null`); LTP remains an integer paise value. A quote replaces prior state only when its timestamp is newer, or when it occurs later in the same source file with an equal timestamp. Buy Spread is Future Bid minus Stock Ask, and Sell Spread is Stock Bid minus Future Ask; either result is `null` when an input is unavailable.

The engine retains all 228 rows throughout replay and after completion. It starts once, globally, when the first WebSocket client connects.

## WebSocket stream

Connect to `ws://localhost:3000/ws` by default. Every connection immediately receives a full 228-row snapshot and the current replay status. The first connection starts the single replay; additional or reconnected clients never start another replay.

Changed rows are coalesced by symbol and published in sequence-numbered deltas once per second. Any remaining changes are flushed immediately before `complete`, and the final snapshot remains available to later connections. Status values are `waiting`, `running`, `complete`, and `error`.

Protocol prices are converted from internal paise to rupees. See [the committed WebSocket protocol](docs/WEBSOCKET_PROTOCOL.md) for the exact version 1 message schemas, sequencing rules, reconnect behavior, and null handling.

## Frontend application

Open `http://localhost:5173` during local development. The responsive Basis dashboard reports connection and replay state, contract and quote coverage, the latest sequence, and safe transport diagnostics. It uses the committed protocol rather than importing backend implementation code.

The client rejects malformed messages and unsupported protocol versions. A full snapshot replaces all local rows; only the next sequence delta is applied. Stale deltas are ignored, while a missing snapshot, sequence gap, invalid message, or interrupted socket triggers an exponential reconnect and obtains a fresh authoritative snapshot. The reconnect delay begins at 500 ms and caps at eight seconds.

The table retains all 228 symbols and displays exactly Symbol, Stock LTP, Future LTP, Buy Spread, and Sell Spread. Symbol is the stable AG Grid row ID. Snapshots replace the authoritative row set; one-second deltas update only their changed symbols through grid transactions. Columns support sorting, typed filters, resizing, responsive flex sizing, and a symbol quick search. Numeric values use two decimal places, while unavailable values remain an em dash.

## Container workflow

Run the packaged PostgreSQL and backend services with:

```sh
docker compose up --build
```

Compose reads the host `DATA_DIR` from `.env`, mounts it at `/data` read-only, waits for PostgreSQL health, and then starts the backend. PostgreSQL state is retained in the `postgres-data` volume.

## Health endpoints

- `GET http://localhost:3000/health/live` confirms the HTTP process is alive.
- `GET http://localhost:3000/health/ready` queries PostgreSQL and returns HTTP 503 when unavailable.

## Verification commands

```sh
pnpm check
docker compose config --quiet
```

To run the supplied-file count test explicitly:

```sh
DATA_DIR=/absolute/path/to/external/data pnpm --filter @cash-future/backend test -- supplied-contracts.test.ts
```

The PostgreSQL-backed universe integration test runs when `DATABASE_URL` is set:

```sh
DATABASE_URL=postgresql://... DATA_DIR=/absolute/path/to/external/data pnpm --filter @cash-future/backend test
```

See [the project specification](docs/PROJECT_SPEC.md) for the approved nine-component plan and [the progress log](docs/PROGRESS.md) for checkpoint evidence.

## Current limitations

- The frontend is not yet included in Docker Compose; that integration begins in Component 8.
- The AG Grid Community production bundle is approximately 1.57 MB before gzip (446 kB gzip); bundle splitting remains an optimization opportunity.
- No order execution or trading functionality is present or planned.
