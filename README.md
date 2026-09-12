# Cash–Future Table

Component 1 provides the TypeScript/Express backend foundation and PostgreSQL development stack. Domain ingestion, live market delivery, replay, and the frontend are intentionally deferred.

## Local development

Requirements: Node.js 22+, pnpm 11+, and Docker.

```sh
cp .env.example .env
# Fill every blank database value in .env before continuing.
docker compose up -d postgres
pnpm install
pnpm --filter @cash-future/backend dev
```

The service applies SQL migrations before listening. Its health endpoints are:

- `GET http://localhost:3000/health/live`
- `GET http://localhost:3000/health/ready`

Run every local quality gate with:

```sh
pnpm check
docker compose config --quiet
```

To run the packaged stack, use `docker compose up --build`. Compose reads credentials from the ignored `.env`; production environments should inject them through a secret manager.

See [the project specification](docs/PROJECT_SPEC.md) for architecture and scope, and [the progress log](docs/PROGRESS.md) for checkpoint evidence.
