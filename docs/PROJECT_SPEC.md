# Cash–Future Table: Project Specification

## Purpose

Cash–Future Table will provide a local-first view of cash and futures market relationships. The system will ingest externally supplied market-contract data, persist normalized state in PostgreSQL, and later expose live and replayed views through a browser interface.

## Architecture

The repository is a pnpm workspace with independent top-level applications:

- `backend`: TypeScript/Express service responsible for persistence, APIs, and later market-data processing.
- `frontend`: reserved workspace location for a later component; it is intentionally absent in Component 1.
- PostgreSQL: durable application state and migration history.
- External data directory: market data stays outside the repository and outside Docker image layers. A future ingestion component will receive its location through explicit configuration and mount it read-only when containerized. Raw source files must never be committed, copied into application source, or mutated by the service.

## Component plan

1. Backend foundation: workspace, validated configuration, PostgreSQL pool and migrations, structured logging, health endpoints, JSON errors, graceful shutdown, verification tooling, and Docker Compose.
2. Contract ingestion: define the external data-directory contract, parsers, validation, normalized schema, idempotent import, and audit reporting.
3. Market services: cash/future relationship queries and service APIs.
4. Live delivery and replay: WebSockets, replay clock, ordering, and recovery behavior.
5. Frontend: table UX, connection states, filters, and replay controls.
6. Operational hardening: observability, performance, security review, and deployment documentation.

## Component 1 behavior

The backend validates all environment input before opening a server. Startup obtains a PostgreSQL advisory lock, verifies SHA-256 checksums for previously applied SQL migrations, applies pending migrations transactionally, and refuses to start if migration history was changed. Logs are newline-delimited structured JSON with credentials redacted.

`GET /health/live` confirms that the process can serve HTTP and does not query dependencies. `GET /health/ready` queries PostgreSQL and returns HTTP 503 when it is unavailable. Unknown routes and server errors use a consistent JSON error envelope containing a request ID. SIGINT and SIGTERM stop accepting connections, close PostgreSQL, and enforce a configurable shutdown deadline.

## Configuration

See `.env.example` for the complete Component 1 contract. Secrets belong only in the environment or an ignored `.env` file. Compose requires the database name, user, and password from that file and contains no credential defaults. Production deployments should inject secrets through their platform's secret manager rather than copying a local `.env` file.

## Explicit Component 1 exclusions

Component 1 does not implement contract/file ingestion, a market-data schema, WebSockets, replay, domain endpoints, or frontend files. The external data directory is an architectural boundary only until Component 2 defines and tests its contract.
