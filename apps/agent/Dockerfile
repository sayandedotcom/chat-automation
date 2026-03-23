# ============================================
# Stage 1: Build dependencies with uv
# ============================================
FROM python:3.13-slim AS builder

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
FROM python:3.13-slim AS runner

WORKDIR /app

# Set Python environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8 \
    PYTHONPATH="/app/chat/src" \
    PATH="/root/.local/bin:/app/.venv/bin:/usr/local/bin:$PATH"

# Install Node.js 18 for MCP servers (required for npx)
RUN apt-get update && apt-get install -y --no-install-recommends \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Install uv (needed at runtime for MCP subprocess fallback)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Pre-install MCP server binaries so they're available via shutil.which()
# at runtime. Without this, uv/npx resolve + download dependencies on every
# container start, which is slow and can hang.
RUN uv tool install workspace-mcp==1.11.1
RUN npm install -g @notionhq/notion-mcp-server@2.1.0 tavily-mcp@0.2.17

# Copy the virtual environment and source from builder
COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app/chat /app/chat

EXPOSE 8000

CMD ["/app/.venv/bin/python", "-m", "uvicorn", "chat.api:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
