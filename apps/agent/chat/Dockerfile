# Custom Dockerfile for SST Python Lambda container.
# Extends SST's built-in template to include uv and Node.js in the runtime
# image, which are required for spawning MCP servers as subprocesses:
#   - Google Workspace MCP: "uv tool run workspace-mcp@..."
#   - Tavily/Notion/Vercel MCP: "npx -y @server/package"

ARG PYTHON_VERSION=3.11
ARG PYTHON_RUNTIME

# Stage 1: Build environment (install build tools and dependencies)
FROM public.ecr.aws/lambda/python:${PYTHON_VERSION} AS build

RUN if [[ "$PYTHON_RUNTIME" == 3.1[2-9]* ]]; then \
  dnf install -y git gcc; \
  else \
  yum install -y git gcc; \
  fi

COPY requirements.txt ${LAMBDA_TASK_ROOT}/requirements.txt

RUN --mount=from=ghcr.io/astral-sh/uv,source=/uv,target=/bin/uv \
  uv pip install -r requirements.txt --target ${LAMBDA_TASK_ROOT} --system --compile-bytecode

# Stage 2: Final runtime image
FROM public.ecr.aws/lambda/python:${PYTHON_VERSION}

# Install uv binary — needed at runtime for MCP subprocess: "uv tool run workspace-mcp@..."
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Install Node.js 16 — the last version compatible with Amazon Linux 2 (glibc 2.26).
# Needed at runtime for MCP servers spawned via "npx -y @server/package".
# Node 18+ requires glibc 2.28 which AL2 doesn't have.
# Lambda base image lacks tar, so install it first.
ARG NODE_VERSION=16.20.2
RUN yum install -y tar gzip && \
  curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.gz | \
  tar -xz --strip-components=1 -C /usr/local/ && \
  yum remove -y tar gzip && yum clean all

# Ensure uv and npx are discoverable by subprocess calls.
# Lambda filesystem is read-only except /tmp — redirect all caches there.
ENV PATH="/usr/local/bin:${PATH}" \
  UV_CACHE_DIR="/tmp/.uv-cache" \
  UV_TOOL_DIR="/tmp/.uv-tools" \
  npm_config_cache="/tmp/.npm" \
  HOME="/tmp"

# Verify both are available
RUN uv --version && node --version && npx --version

# Copy the installed dependencies from the build stage
COPY --from=build ${LAMBDA_TASK_ROOT} ${LAMBDA_TASK_ROOT}

# Copy the application code into the final image
COPY . ${LAMBDA_TASK_ROOT}
