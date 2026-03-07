# ============================================
# Stage 1: Build dependencies with uv
# ============================================
FROM python:3.12-slim AS builder

WORKDIR /app

# Install uv for fast dependency resolution
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy dependency files first (layer caching)
COPY pyproject.toml uv.lock ./
COPY chat/pyproject.toml chat/pyproject.toml

# Install dependencies into a virtual env (target the chat workspace member)
RUN uv sync --frozen --no-dev --no-install-project --package chat

# Copy source code
COPY . .

# Install the project itself
RUN uv sync --frozen --no-dev --package chat

# ============================================
# Stage 2: Production runner
# ============================================
FROM python:3.12-slim AS runner

WORKDIR /app

# Set Python environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8 \
    PYTHONPATH="/app/chat/src" \
    PATH="/app/.venv/bin:/usr/local/bin:$PATH"

# Install Node.js 18 for MCP servers (required for npx)
RUN apt-get update && apt-get install -y --no-install-recommends \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Install uv (needed at runtime for workspace-mcp)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Pre-install workspace-mcp at build time to avoid runtime downloads
RUN uv tool install workspace-mcp@1.11.1

# Copy the virtual environment and source from builder
COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app/chat /app/chat

EXPOSE 8000

# WEB_CONCURRENCY controls worker count (default 4).
# Note: MemorySaver checkpointer is per-process — multi-turn conversation
# continuity requires a shared checkpointer (e.g. AsyncPostgresSaver).
ENV WEB_CONCURRENCY=4
CMD /app/.venv/bin/python -m uvicorn chat.api:app --host 0.0.0.0 --port 8000 --workers ${WEB_CONCURRENCY}
