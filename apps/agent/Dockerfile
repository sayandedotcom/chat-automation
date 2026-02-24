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

# Install uv directly from GitHub releases (cache-bust: v2 method - direct binary)
# Using specific version to ensure reproducibility and cache invalidation
ARG UV_VERSION=0.5.11
RUN yum install -y curl ca-certificates && \
    curl -LsSf "https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-x86_64-unknown-linux-gnu.tar.gz" | tar -xz -C /tmp && \
    mv /tmp/uv-x86_64-unknown-linux-gnu/uv /usr/local/bin/uv && \
    chmod +x /usr/local/bin/uv && \
    rm -rf /tmp/uv-x86_64-unknown-linux-gnu && \
    /usr/local/bin/uv --version && \
    echo "UV_DIRECT_DOWNLOAD_COMPLETE"

# Install Node.js for MCP servers (required for npx)
RUN yum install -y nodejs npm && yum clean all && node --version

# Copy the installed dependencies from the build stage
COPY --from=build ${LAMBDA_TASK_ROOT} ${LAMBDA_TASK_ROOT}

# Copy the application code into the final image
COPY . ${LAMBDA_TASK_ROOT}
