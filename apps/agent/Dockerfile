# ============================================
# Stage 1: Build dependencies with uv
# ============================================
FROM python:3.10-slim AS builder

WORKDIR /app

# Install uv for fast dependency resolution
RUN pip install --no-cache-dir uv

# Copy dependency files first (layer caching)
COPY pyproject.toml uv.lock ./
COPY chat/pyproject.toml chat/pyproject.toml

# Install dependencies into a virtual env (target the chat workspace member)
RUN uv sync --frozen --no-dev --no-install-project --package chat

# Copy source code
COPY . .

# Install the project itself
RUN uv sync --frozen --no-dev --package chat

# Ensure uvicorn is installed (uv.lock may not resolve fastapi[standard] extras)
RUN uv pip install uvicorn[standard]

# ============================================
# Stage 2: Production runner
# ============================================
FROM python:3.10-slim AS runner

WORKDIR /app

# Set Python environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8 \
    PYTHONPATH="/app/chat/src" \
    PATH="/app/.venv/bin:$PATH"

# Copy the virtual environment and source
COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app/chat /app/chat

# Install Node.js for MCP servers (required for npx)
RUN apt-get update && apt-get install -y \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Install uv (provides uvx for workspace-mcp)
RUN pip install uv --no-cache-dir

EXPOSE 8001

CMD ["python", "-m", "uvicorn", "chat.api:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]
