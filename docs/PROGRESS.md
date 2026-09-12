# Project Progress

## Current checkpoint

Component 3 — contract universe (implemented and verified on 2026-09-13). Stop before Component 4 pending user review.

## Component 1 review corrections

- Restored the approved nine-component plan and all fixed technical rules in `docs/PROJECT_SPEC.md`, including exactly 228 rows, all 18 `NSETEST` symbols, absolute minimum expiry, paise scaling, zero bid/ask as `null`, newest timestamp/later-row tie-breaking, two workers, first-client replay, one-second deltas, final-state retention, and the five exact grid columns.
- Added direct migration-runner tests for ordered execution, matching-checksum skipping, checksum mismatch rejection, transactional rollback, advisory-lock release, and client release.
- Changed HTTP startup to await the actual `listening` event and reject asynchronous listen errors before startup is considered successful.
- Confirmed and fixed the pnpm 11 deploy defect by enabling `injectWorkspacePackages: true`; clean `pnpm deploy` and the backend Docker image now build successfully without a legacy fallback.
- Added `.pnpm-store` to formatter exclusions so local package-cache contents are never traversed.

## Component 2 behavior

- Validates an absolute `DATA_DIR` and traversal-safe configurable contract filenames, with the two supplied names as defaults.
- Streams headerless files line by line and requires exactly 14 whitespace-delimited fields.
- Retains only NSECM `EQUITY` and NSEFO `FUTSTK` records and rejects duplicate selected tokens.
- Converts NSECM expiry `-1` to `NULL` and FUTSTK epoch seconds to a UTC `YYYY-MM-DD` date.
- Stores `market`, `token`, `instrument_type`, `symbol`, nullable `expiry_date`, and `contract_name` in `app.contracts` with primary key `(market, token)` and index `(symbol, instrument_type, expiry_date)`.
- Parses both files before database mutation, then replaces both segments in one transaction using batches of at most 500 rows. Any parse or insert failure leaves the prior committed dataset intact.
- Runs migrations, then contract import, then starts HTTP. Import failure prevents the service from listening.
- Logs only cash/future/total counts in the successful import summary; it does not log the host data-directory path.
- Mounts the external host `DATA_DIR` at `/data` read-only for the backend container. No source data is copied into Git or the Docker image.

## Component 3 behavior

- Adds the `app.contract_universe` PostgreSQL view through checksum-protected migration `003_create_contract_universe_view.sql`.
- Partitions NSEFO FUTSTK contracts by symbol and selects the absolute minimum expiry. Expiry is not interpreted relative to the current date.
- Uses the lowest future token as a deterministic tie-breaker when multiple contracts share the minimum expiry.
- Joins the selected future to NSECM EQUITY by exact symbol and returns one symbol-ordered entry containing `symbol`, `cashToken`, `futureToken`, and `futureExpiry`.
- Publishes the contract as the read-only TypeScript `ContractUniverseEntry` type and freezes returned rows and the containing array at runtime.
- Rejects invalid database row shapes, unsafe or non-positive tokens, invalid date strings, duplicate symbols, a total other than 228 rows, or a result without exactly 18 symbols ending in `NSETEST`.
- Loads and validates the universe after the atomic contract import and before HTTP starts. A universe failure therefore prevents readiness rather than exposing a partial or invalid selection.

## Verification evidence

- `pnpm format:check`: passed.
- `pnpm lint`: passed with zero errors or warnings.
- `pnpm typecheck`: passed under strict TypeScript settings.
- Full supplied-file `pnpm test`: 9 files passed, 27 tests passed with PostgreSQL integration enabled. Coverage includes configuration, parsing/filtering/expiry conversion, filename-and-line errors, duplicates, transactional rollback, repeat-import stability, migration behavior, listen errors, health routes, exact full-file counts, universe row validation, and the live universe view.
- Supplied source validation: 4,433 NSECM `EQUITY` records, 647 NSEFO `FUTSTK` records, and zero duplicate `(market, token)` keys.
- `pnpm build`: passed.
- Clean local-filesystem snapshot `pnpm check`: passed end to end with the supplied `DATA_DIR`, covering formatting, lint, strict typecheck, all 19 tests, and production build.
- Clean `pnpm deploy --filter @cash-future/backend --prod <temporary-directory>`: passed with 97 production packages.
- `docker compose config --quiet`: passed.
- `docker compose build backend`: passed, including frozen install, TypeScript build, modern pnpm deploy, and runtime-image assembly.
- Live Compose startup: PostgreSQL and backend both healthy; two migrations applied; startup import logged 4,433 cash, 647 futures, and 5,080 total contracts.
- PostgreSQL validation: `NSECM=4433`, `NSEFO=647`, zero duplicate keys, and two migration records.
- Live schema validation: `contracts_pkey` and `contracts_symbol_instrument_expiry_idx` both exist.
- Runtime health: `/health/live` and `/health/ready` returned HTTP 200 payloads.
- Component 3 clean-checkout `pnpm check` with supplied `DATA_DIR`: passed formatting, lint, strict typecheck, 26 tests with the environment-gated PostgreSQL test skipped, and production build.
- Component 3 PostgreSQL-enabled test suite: all 9 files and all 27 tests passed, including the service integration test against the live database.
- Migration `003_create_contract_universe_view.sql` applied successfully; rebuilt backend startup logged 228 universe rows before listening and remained healthy.
- Live universe validation: 228 rows, 228 distinct symbols, 18 symbols ending in `NSETEST`, and zero selected expiries differing from each symbol's absolute FUTSTK minimum.
- Repeat-import integration check: backend restart re-imported 5,080 contracts; ordered dataset digest remained `2fd6cb53bda88b15263ea81aa1e59846` before and after.
- Failure integration check: an isolated backend with an intentionally missing cash filename exited with a filename/line startup error; the prior PostgreSQL count and digest remained unchanged, and the primary backend stayed ready.
- Secret policy: `.env` is ignored and untracked; tracked configuration uses environment interpolation and contains no credential-bearing connection URL, private key, or common API-token literal.

## Deliberately deferred

- Market-data parsing, worker threads, quote state, price conversion, timestamp ordering, and spreads.
- WebSocket protocol, replay lifecycle, snapshots, and one-second deltas.
- React/Vite/AG Grid frontend and the five-column table.
- Complete three-service Docker integration and final end-to-end QA.
- Order execution and trading functionality are not implemented and are not part of the project.

## Operational note

The verified local PostgreSQL and backend Compose services are currently running and healthy. Stop them with `docker compose down` when they are no longer needed; the named PostgreSQL volume remains persistent unless explicitly removed.
