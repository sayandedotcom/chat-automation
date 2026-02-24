# Multi-stage build for Lambda deployment with native deps support
ARG PYTHON_VERSION=3.10

# Build stage
FROM python:${PYTHON_VERSION}-slim AS builder

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir uv

COPY requirements.txt /tmp/requirements.txt
RUN uv venv && uv pip install --python /app/.venv/bin/python -r /tmp/requirements.txt && \
    uv pip install --python /app/.venv/bin/python awslambdaric

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
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

RUN mkdir -p ${LAMBDA_TASK_ROOT} ${LAMBDA_RUNTIME_DIR}
WORKDIR ${LAMBDA_TASK_ROOT}

COPY --from=builder /app/.venv /app/.venv
COPY . ${LAMBDA_TASK_ROOT}

RUN find ${LAMBDA_TASK_ROOT} -type f -name "*.pyc" -delete && \
    find ${LAMBDA_TASK_ROOT} -type d -name "__pycache__" -delete && \
    find ${LAMBDA_TASK_ROOT} -type f -name "*.pyo" -delete

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH="/var/task"

ENTRYPOINT ["/app/.venv/bin/python", "-m", "awslambdaric"]
CMD ["api.handler"]
