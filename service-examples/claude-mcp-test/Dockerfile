# ── Build stage ───────────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /app

# Install build deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt


# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

# Non-root user for security
RUN useradd --create-home --shell /bin/bash mcp
WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy server source
COPY server.py .

# Ownership
RUN chown -R mcp:mcp /app
USER mcp

# ── Environment defaults ───────────────────────────────────────────────────────
# TRANSPORT can be overridden at runtime:
#   stdio          → for Claude Desktop (docker run -i)
#   http           → for HTTP clients and ToolHive Inspector
#   sse            → legacy SSE transport
#   streamable-http → modern streamable HTTP transport
ENV TRANSPORT=http
ENV PORT=8000
ENV HOST=0.0.0.0
# GITHUB_TOKEN and MCP_API_KEY should be injected at runtime, not baked in.

EXPOSE 8000

# Health check (only meaningful for HTTP transport)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" \
    || exit 1

ENTRYPOINT ["python", "server.py"]
