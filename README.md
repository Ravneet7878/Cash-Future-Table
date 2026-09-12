# Cash–Future Table

Components 1 and 2 provide the TypeScript/Express backend foundation, PostgreSQL development stack, and atomic startup ingestion of external NSE contract reference files. Contract-universe selection, market replay, WebSockets, and the frontend are intentionally deferred to later reviewed checkpoints.

## Requirements

- Node.js 22+
- pnpm 11+
- Docker Desktop for the container workflow
- The two supplied contract reference files in an external directory

## External contract files

The application expects these exact default filenames:

- `nse_cm_ref_contract_master.csv`
- `nse_fo_ref_contract_master.csv`

Both files are headerless and contain 14 whitespace-delimited fields per line, in this order:

```text
token streamId instrumentType symbol expiryDate strikePrice optionType lotSize lotSize2 tickSize freezeQuantity minPriceRange maxPriceRange contractName
```

Only NSECM `EQUITY` and NSEFO `FUTSTK` records are retained. The supplied complete files produce 4,433 cash contracts and 647 futures contracts. Source files remain outside Git and are mounted read-only in Docker.

## Configuration

Create the ignored local environment file:

```sh
cp .env.example .env
```

Fill the blank PostgreSQL values and set `DATA_DIR` to the absolute directory containing the two files. The filenames can be changed through `NSE_CM_CONTRACT_FILE` and `NSE_FO_CONTRACT_FILE`, but each value must be a filename without directory components.

Secrets belong only in ignored `.env` for local development or in a deployment secret manager. Never commit `.env`.

## Local development

Start PostgreSQL, then start the backend:

```sh
docker compose up -d postgres
pnpm install
pnpm --filter @cash-future/backend dev
```

Startup performs this sequence before accepting HTTP traffic:

1. Validate environment configuration.
2. Connect to PostgreSQL and apply checksum-protected SQL migrations.
3. Stream and validate both external contract files.
4. Replace both stored market segments in one transaction using bounded insert batches.
5. Start the Express server only after the import commits.

Malformed input reports its filename and line. Parsing or database failure leaves previously committed contracts intact and prevents the HTTP server from becoming ready.

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

See [the project specification](docs/PROJECT_SPEC.md) for the approved nine-component plan and [the progress log](docs/PROGRESS.md) for checkpoint evidence.

## Current limitations

- No 228-row cash/future universe query yet.
- No market-data parsing, workers, price state, or spread calculations.
- No WebSocket server or replay lifecycle.
- No React/AG Grid frontend.
- No order execution or trading functionality is present or planned.
