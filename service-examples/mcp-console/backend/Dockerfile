# syntax=docker/dockerfile:1
#
# Combines the mcp-console backend AND its Postgres database in a single container.
# Chosen for deployment simplicity for this internal tool — not a general recommendation
# (no independent Postgres upgrades/scaling, and `docker compose down -v` destroys the data
# volume along with the app). Data persists across restarts via the "pgdata" volume declared
# in compose.yml.
#
# ─── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY tsconfig.json nest-cli.json typeorm.datasource.ts ./
COPY src/ ./src/
COPY migrations/ ./migrations/

RUN npm run build

# ─── Stage 2: production image (Node + Postgres) ─────────────────────────────
FROM node:22-alpine AS release

RUN apk add --no-cache postgresql16 postgresql16-contrib su-exec \
    && mkdir -p /var/lib/postgresql/data /run/postgresql \
    && chown -R postgres:postgres /var/lib/postgresql /run/postgresql

WORKDIR /app

ENV NODE_ENV=production
ENV POSTGRES_HOST=localhost
ENV POSTGRES_PORT=5432

# Keep full node_modules (including ts-node/typeorm CLI) and the TS source — migrations run
# at container startup via the TypeORM CLI against typeorm.datasource.ts, which imports
# entities from src/ (ts-node-compiled on the fly), not the compiled dist/ output.
COPY --from=builder /app/node_modules       ./node_modules
COPY --from=builder /app/dist               ./dist
COPY --from=builder /app/src                ./src
COPY --from=builder /app/tsconfig.json      ./tsconfig.json
COPY --from=builder /app/migrations         ./migrations
COPY --from=builder /app/typeorm.datasource.ts ./typeorm.datasource.ts
COPY --from=builder /app/package.json       ./package.json
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

LABEL org.opencontainers.image.title="mcp-console-backend"
LABEL org.opencontainers.image.description="MCP console backend + Postgres, combined for deployment simplicity"
LABEL org.opencontainers.image.source="https://github.com/bcgov/common-notify"

VOLUME ["/var/lib/postgresql/data"]
EXPOSE 3100

ENTRYPOINT ["/docker-entrypoint.sh"]
