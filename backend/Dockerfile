FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/package.json
RUN pnpm install --frozen-lockfile
COPY backend backend
RUN pnpm --filter @cash-future/backend build
RUN pnpm deploy --filter @cash-future/backend --prod /prod/backend

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
USER node
COPY --from=build --chown=node:node /prod/backend/node_modules ./node_modules
COPY --from=build --chown=node:node /prod/backend/package.json ./package.json
COPY --from=build --chown=node:node /app/backend/dist ./dist
COPY --from=build --chown=node:node /app/backend/migrations ./migrations
EXPOSE 3000
CMD ["node", "dist/server.js"]
