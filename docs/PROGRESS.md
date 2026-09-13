# Project Progress

## Current checkpoint

Component 8 — Docker integration (implemented and verified on 2026-09-13). Stop before Component 9 pending user review.

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

## Component 4 behavior

- Adds separate NSECM and NSEFO worker threads over the two external market-data files.
- Streams headerless five-field `token,timestamp,bid,ask,ltp` CSV rows through `readline` without loading either file into memory.
- Validates integer row fields with filename and line context, filters to the selected cash/future tokens, and retains prices as integer paise.
- Converts zero bid or ask to `null`; LTP remains its source integer, including zero if present.
- Sends batches no larger than the configurable `REPLAY_BATCH_SIZE` (default 500). Each worker waits for an acknowledgement before reading beyond the delivered batch, bounding its in-flight main-thread work to one batch.
- Retains one quote state per universe symbol. Newer timestamps win, while a later source row wins when timestamps are equal.
- Calculates Buy Spread as Future Bid minus Stock Ask and Sell Spread as Stock Bid minus Future Ask, with `null` propagation for unavailable inputs.
- Exposes immutable 228-row snapshots and changed rows while retaining the final state after both workers finish.
- Validates traversal-safe market-data filenames and a replay batch size from 1 through 10,000.
- Keeps `backend/src/config.ts` as the single validated backend configuration boundary and only production reader of `process.env`. Contract import and replay use its typed path resolvers rather than assembling independent configuration.
- Keeps the ignored `.env` and tracked `.env.example` variable-name sets synchronized; the example contains blank secret placeholders only.

## Component 5 behavior

- Adds the exact-version `ws` runtime and TypeScript declaration dependencies and exposes protocol version 1 at configurable `WEBSOCKET_PATH` (`/ws` by default).
- Sends every newly connected client a complete 228-row snapshot followed by the current replay status and data sequence.
- Starts the one global replay when the first client connects. Later clients and reconnects reuse the same running or completed engine and never restart it.
- Coalesces changed rows by symbol between publications and emits complete row upserts in monotonically increasing deltas once per second.
- Converts internal integer paise to protocol rupees while preserving unavailable values as JSON `null`.
- Flushes pending changes immediately before `complete` or `error`, then clears the publication timer.
- Retains the completed 228-row state and final sequence for every later connection.
- Publishes `waiting`, `running`, `complete`, and `error` statuses with a safe diagnostic on error.
- Terminates replay workers and WebSocket clients during graceful backend shutdown.
- Commits the full endpoint, row shape, message schemas, sequencing, reconnect rules, null behavior, and lifecycle contract in `docs/WEBSOCKET_PROTOCOL.md`.

## Component 6 behavior

- Adds an independent React 19.3 and Vite 8.3 application with strict TypeScript, ESLint, Vitest 5, jsdom, Testing Library, and exact dependency versions.
- Implements protocol version 1 as a standalone frontend contract with runtime validation for message type, version, sequence, status, row count, unique symbols, finite price values, and error semantics.
- Replaces all local rows from each authoritative 228-row snapshot and applies complete delta upserts by symbol only when the sequence is exactly next.
- Ignores stale or duplicate deltas and reconnects for a missing snapshot, sequence gap, ahead-of-state status, malformed JSON, invalid payload, or transport failure.
- Uses exponential reconnect delay starting at 500 milliseconds and capped at eight seconds; a protocol gap requests an immediate fresh snapshot.
- Separates the WebSocket controller from React and exposes stable external-store subscriptions through `useSyncExternalStore`.
- Adds a single typed browser configuration boundary in `frontend/src/config.ts`; `VITE_WEBSOCKET_URL` must use `ws://` or `wss://`, with secure same-origin derivation when blank.
- Adds the responsive Basis market-intelligence dashboard with connection/replay states, universe and quote coverage, sequence freshness, safe diagnostics, reduced-motion support, and an explicit read-only/no-order-execution boundary.
- Keeps AG Grid and the final five-column market table out of this checkpoint so frontend state handling is verified independently first.
- Updates root workspace commands so formatting, lint, type checks, tests, and builds cover both backend and frontend applications.

## Component 7 behavior

- Adds exact-version AG Grid Community and React 36.1 dependencies, registered through the React-scoped Community module provider with no Enterprise modules or license requirement.
- Replaces the Component 6 table preview with a polished live grid containing exactly Symbol, Stock LTP, Future LTP, Buy Spread, and Sell Spread.
- Uses `symbol` as the stable AG Grid row ID and retains the authoritative 228-row client map, including all symbols whose future values remain unavailable.
- Records the last accepted snapshot or delta in frontend state. Snapshots replace the grid row set; deltas call `applyTransaction` with only the changed complete-row upserts.
- Formats every numeric market value in rupees with exactly two decimals and renders `null` as an em dash.
- Enables sorting, typed text/number filtering, floating filters, column resizing, responsive flex sizing with minimum widths, and a symbol quick search.
- Adds tabular numeric alignment, restrained positive/negative spread styling, cell-change flash, loading state, row count, missing-value guidance, responsive controls, and keyboard-visible native inputs.
- Corrects frontend ESLint path resolution for workspace paths containing spaces by decoding the configuration URL before passing it to the TypeScript project service.

## Component 8 behavior

- Adds a multi-stage frontend image: Node.js 22 builds the Vite application from the frozen workspace lockfile, and pinned official Nginx 1.31.5 Alpine serves only the production assets.
- Builds deployment assets without a host-specific WebSocket URL so the browser derives same-origin `/ws` instead of attempting to connect to its own localhost in remote deployments.
- Adds an Nginx template that serves SPA routes, exposes `/healthz`, enables gzip and response-security headers, and explicitly forwards the HTTP/1.1 Upgrade and Connection headers required for WebSocket proxying.
- Maps public `/ws` to the backend's configurable internal `WEBSOCKET_PATH`, keeping the browser contract stable if the backend path is customized.
- Extends Compose to run PostgreSQL, backend, and frontend in health-ordered sequence, with explicit health checks, restart policies, graceful-stop windows, persistent database storage, and localhost-only published ports.
- Keeps the external `DATA_DIR` bind exclusive to the backend and read-only. No source data or ignored `.env` file enters either application image context.
- Updates the backend Docker build to include both workspace package manifests, allowing frozen installs after the frontend workspace was introduced.
- Adds root commands for Compose configuration validation, startup/build, logs, and shutdown.
- Replaces the README's incremental build narrative with a final application guide covering architecture, source formats, configuration, full-stack startup, dashboard behavior, replay guarantees, local development, operations, verification, and limitations.

## Verification evidence

- `pnpm format:check`: passed.
- `pnpm lint`: passed with zero errors or warnings.
- `pnpm typecheck`: passed under strict TypeScript settings.
- Component 4 test suite: 10 files passed and 38 tests passed, with the environment-gated PostgreSQL test skipped when `DATABASE_URL` is absent. New coverage includes centralized data-path resolution, market-row parsing, zero bid/ask conversion, filtering, bounded and awaited batches, invalid batch sizes, retained empty rows, paise spreads, null propagation, timestamp ordering, later-row tie-breaking, and unexpected worker tokens.
- Final database-enabled `pnpm check`: formatting, lint, strict typecheck, all 11 test files and all 39 tests, and the production TypeScript build passed.
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
- Full supplied market replay processed 8,392,467 NSECM rows and 20,337,884 NSEFO rows in 15.328 seconds. It matched 1,629,642 cash rows and 1,667,989 future rows across 3,260 and 3,336 batches respectively; neither worker exceeded 500 rows per batch.
- Main-thread responsiveness check: all 15 expected one-second timer ticks fired during the 15.328-second full replay. Peak process RSS was 230 MiB while processing approximately 931 MiB of source data, demonstrating memory usage bounded independently of file size.
- Final supplied-data snapshot: 228 retained rows, 228 stock LTPs, 210 future LTPs, 210 Buy Spreads, and 209 Sell Spreads. The 18 `NSETEST` rows remained present without future quotes.
- Configuration and secret audit: `.env` is ignored and untracked; `.env` and `.env.example` have identical 19-variable key sets; only `backend/src/config.ts` reads `process.env`, while only `frontend/src/config.ts` reads `import.meta.env`; tracked PostgreSQL URLs contain environment interpolation, an ellipsis placeholder, or credential-free localhost test values; no secret value is hardcoded in a tracked file.
- `docker compose config --quiet` passed; the backend image rebuilt from the checkpoint source and the PostgreSQL and backend services both reported healthy.
- Component 5 database-enabled `pnpm check`: formatting, lint, strict typecheck, all 13 test files and all 42 tests, and the production build passed. New integration coverage verifies first-client-only replay start, 228-row snapshots, running reconnects, one-second coalescing, monotonic sequence numbers, immediate final/error flushes, retained final snapshots, and paise-to-rupee conversion.
- Live Docker WebSocket replay: initial snapshot contained 228 rows; statuses arrived as `waiting`, `running`, and `complete`; 35 consecutive deltas were received over 34.842 seconds (34 interval publications plus the immediate final flush).
- Live final WebSocket state contained 228 stock rows, 210 future LTPs, 210 Buy Spreads, and 209 Sell Spreads. A new post-completion connection received sequence 35, `complete`, and a snapshot identical to the state reconstructed from the initial snapshot and all deltas.
- Live worker completion logs retained the verified Component 4 counts: 8,392,467 NSECM source rows and 20,337,884 NSEFO source rows, with maximum batches of 500.
- Component 6 clean-copy `pnpm check` under Node 24.19: formatting, backend/frontend lint, strict type checks, all 13 backend test files with 42 tests, all five frontend test files with 19 tests, and both production builds passed.
- Frontend tests cover protocol rejection, 228-row snapshot replacement, exact-next and stale delta behavior, sequence-gap recovery, replay status, URL validation, exponential reconnect, malformed-message reconnect, and rendered connection/replay/coverage states.
- Vite production output: 0.65 kB HTML, 10.10 kB CSS (3.08 kB gzip), and 453.27 kB JavaScript (137.07 kB gzip).
- Live local DOM verification against the running backend reported 228 universe rows, 228 cash LTPs, 210 future LTPs, active one-second sequences, a live connection, and running replay status.
- Component 7 frontend verification: strict typecheck and production build passed; all six frontend test files and all 24 tests passed; standalone ESLint passed with zero errors or warnings.
- New grid tests verify the exact five-column contract, per-column filters, global sort/resize/floating-filter defaults, stable symbol row IDs, two-decimal and em-dash formatting, full snapshot replacement, and delta-only AG Grid transactions.
- Component 7 Vite production output: 0.65 kB HTML, 10.76 kB CSS (3.28 kB gzip), and 1,566.66 kB JavaScript (446.44 kB gzip). The current Community bundle-size warning is documented as a non-blocking optimization opportunity.
- Component 7 full workspace check: formatting, backend/frontend lint, strict type checks, 42 backend tests (40 passed and two environment-gated tests skipped), all 24 frontend tests, and both production builds passed. The network-enabled rerun was required only so existing backend integration tests could bind ephemeral localhost ports.
- Component 7 configuration audit: `.env` remains ignored and untracked; its variable-name digest exactly matches `.env.example`; no new configuration variables were introduced; only the central backend and frontend config modules read their respective environment APIs; and the tracked secret-pattern scan returned no matches.
- Component 8 full workspace check: formatting, backend/frontend lint, strict type checks, 42 backend tests (40 passed and two environment-gated tests skipped), all 24 frontend tests, and both production builds passed.
- `docker compose config --quiet` passed, and clean frozen builds completed for both backend and frontend images. The frontend production build emitted 0.65 kB HTML, 10.76 kB CSS (3.28 kB gzip), and 1,352.20 kB JavaScript (384.41 kB gzip).
- `docker compose up -d --build --wait` rebuilt and started the finalized stack successfully; PostgreSQL, backend, and frontend all reached Docker `healthy` state in dependency order.
- Live HTTP integration returned 200 for the Nginx dashboard, frontend `/healthz`, backend `/health/live`, and backend `/health/ready`.
- Live same-origin WebSocket integration through `ws://127.0.0.1:8080/ws` received a complete 228-row sequence-zero snapshot followed by `waiting` and `running` replay statuses.
- Runtime container inspection confirmed the backend's `/data` mount has `readWrite=false`. Nginx's native configuration test passed, and the frontend response included nosniff, frame-denial, strict-referrer, and camera/microphone/geolocation permissions headers.
- Component 8 configuration audit reconfirmed identical `.env` and `.env.example` variable-name digests, ignored and untracked `.env`, exactly one backend and one frontend environment-reading config module, no component-oriented wording in README, and no tracked secret-pattern matches.
- Repeat-import integration check: backend restart re-imported 5,080 contracts; ordered dataset digest remained `2fd6cb53bda88b15263ea81aa1e59846` before and after.
- Failure integration check: an isolated backend with an intentionally missing cash filename exited with a filename/line startup error; the prior PostgreSQL count and digest remained unchanged, and the primary backend stayed ready.
- Secret policy: `.env` is ignored and untracked; tracked configuration uses environment interpolation and contains no credential-bearing connection URL, private key, or common API-token literal.

## Deliberately deferred

- Playwright and final end-to-end QA.
- Order execution and trading functionality are not implemented and are not part of the project.

## Operational note

The verified local PostgreSQL, backend, and frontend Compose services are currently running and healthy. Open the dashboard at `http://localhost:8080`. Stop the stack with `docker compose down` when it is no longer needed; the named PostgreSQL volume remains persistent unless explicitly removed.
