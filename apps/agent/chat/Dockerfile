# Multi-stage build for Lambda deployment with native deps support
ARG PYTHON_VERSION=3.10

# Build stage
FROM python:${PYTHON_VERSION}-slim AS builder

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir uv

COPY pyproject.toml ./

RUN uv venv && uv pip install --python /app/.venv/bin/python -e .

COPY src/ ./src/

RUN uv pip install --python /app/.venv/bin/python -e .

RUN uv pip install --python /app/.venv/bin/python awslambdaric

# Runtime stage
FROM python:${PYTHON_VERSION}-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8 \
    LAMBDA_TASK_ROOT=/var/task \
    LAMBDA_RUNTIME_DIR=/var/runtime

RUN apt-get update && apt-get install -y \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /tmp/* \
    && rm -rf /var/tmp/*

RUN pip install uv --no-cache-dir

RUN mkdir -p ${LAMBDA_TASK_ROOT} ${LAMBDA_RUNTIME_DIR}
WORKDIR ${LAMBDA_TASK_ROOT}

COPY --from=builder /root/.local/share/uv /root/.local/share/uv
COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app/src ./src

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH="/var/task"

RUN find ${LAMBDA_TASK_ROOT} -type f -name "*.pyc" -delete && \
    find ${LAMBDA_TASK_ROOT} -type d -name "__pycache__" -delete && \
    find ${LAMBDA_TASK_ROOT} -type f -name "*.pyo" -delete

ENTRYPOINT ["/app/.venv/bin/python", "-m", "awslambdaric"]
CMD ["src.chat.api.handler"]
