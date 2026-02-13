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

# Install dependencies into a virtual env
RUN uv sync --frozen --no-dev --no-install-project

# Copy source code
COPY . .

# Install the project itself
RUN uv sync --frozen --no-dev

# ============================================
# Stage 2: Production runner
# ============================================
FROM python:3.10-slim AS runner

WORKDIR /app

# Set Python environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8 \
    PATH="/app/.venv/bin:$PATH"

# Copy the virtual environment and source
COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app/chat /app/chat

EXPOSE 8001

CMD ["uvicorn", "chat.src.chat.api:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]
