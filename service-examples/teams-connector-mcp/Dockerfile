# syntax=docker/dockerfile:1
# ─── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# Remove dev dependencies after build
RUN npm prune --omit=dev

# ─── Stage 2: production image ───────────────────────────────────────────────
FROM node:22-alpine AS release

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/dist       ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

LABEL org.opencontainers.image.title="teams-connector-mcp"
LABEL org.opencontainers.image.description="MCP server for devx-teams-connector — post notifications to Microsoft Teams"
LABEL org.opencontainers.image.source="https://github.com/bcgov/common-notify"

ENTRYPOINT ["node", "dist/index.js"]
