# Specify the Python version as an ARG
ARG PYTHON_VERSION=3.11
ARG PYTHON_RUNTIME

# Stage 1: Build environment (install build tools and dependencies)
FROM public.ecr.aws/lambda/python:${PYTHON_VERSION} AS build

# Ensure git and gcc are installed for building dependencies
RUN if [[ "$PYTHON_RUNTIME" == 3.1[2-9]* ]]; then \
  dnf install -y git gcc; \
  else \
  yum install -y git gcc; \
  fi

# Copy requirements and install dependencies
COPY requirements.txt ${LAMBDA_TASK_ROOT}/requirements.txt

# Mount the uv image to install the dependencies - uv will not be installed in the final image
RUN --mount=from=ghcr.io/astral-sh/uv,source=/uv,target=/bin/uv \
  uv pip install -r requirements.txt --target ${LAMBDA_TASK_ROOT} --system --compile-bytecode

# Stage 2: Final runtime image
FROM public.ecr.aws/lambda/python:${PYTHON_VERSION}

# CRITICAL: Cache bust - must be first instruction to invalidate all cached layers
# Change this timestamp to force fresh build: 2025-02-26T00:45:00Z
ARG CACHE_BUST=1738134300
RUN echo "Cache bust: $CACHE_BUST" && date

# Install curl for downloading uv
RUN yum install -y curl

# Download and install uv directly
RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    mv /root/.local/bin/uv /usr/local/bin/uv && \
    chmod +x /usr/local/bin/uv && \
    uv --version

# Install Node.js for MCP servers (required for npx)
RUN yum install -y nodejs npm && yum clean all

# Copy the installed dependencies from the build stage
COPY --from=build ${LAMBDA_TASK_ROOT} ${LAMBDA_TASK_ROOT}

# Copy the application code into the final image
COPY . ${LAMBDA_TASK_ROOT}

# Verify uv is in PATH at the end
RUN which uv && uv --version
