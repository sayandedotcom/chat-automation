# Custom Dockerfile for SST Python Lambda container.
# Extends SST's built-in template to include uv and Node.js in the runtime
# image, which are required for spawning MCP servers as subprocesses:
#   - Google Workspace MCP: "uv tool run workspace-mcp@..."
#   - Tavily/Notion/Vercel MCP: "npx -y @server/package"
#
# Uses Python 3.12 on AL2023 (glibc 2.34) so Node 18+ works natively.

ARG PYTHON_VERSION=3.12
ARG PYTHON_RUNTIME

# Stage 1: Build environment (install build tools and dependencies)
FROM public.ecr.aws/lambda/python:${PYTHON_VERSION} AS build

RUN dnf install -y git gcc

COPY requirements.txt ${LAMBDA_TASK_ROOT}/requirements.txt

RUN --mount=from=ghcr.io/astral-sh/uv,source=/uv,target=/bin/uv \
  uv pip install -r requirements.txt --target ${LAMBDA_TASK_ROOT} --system --compile-bytecode

# Stage 2: Final runtime image
FROM public.ecr.aws/lambda/python:${PYTHON_VERSION}

# Install uv binary — needed at runtime for MCP subprocess: "uv tool run workspace-mcp@..."
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Install Node.js 18 — needed at runtime for MCP servers spawned via "npx -y @server/package".
# AL2023 (Python 3.12 base) has Node 18 in its default repos.
RUN dnf install -y nodejs npm && dnf clean all

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
