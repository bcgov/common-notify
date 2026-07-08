# syntax=docker/dockerfile:1
# ─── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY . ./
RUN npm run build

# ─── Stage 2: serve static assets ────────────────────────────────────────────
FROM nginx:1.27-alpine AS release

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

LABEL org.opencontainers.image.title="mcp-console-frontend"
LABEL org.opencontainers.image.description="Web UI for the MCP console"
LABEL org.opencontainers.image.source="https://github.com/bcgov/common-notify"

EXPOSE 80
