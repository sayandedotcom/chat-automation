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

# Install Node.js 18 — needed at runtime for MCP subprocess: "npx -y @server/package"
# Amazon Linux 2 (Lambda Python 3.11 base) doesn't ship nodejs, so pull from NodeSource.
RUN curl -fsSL https://rpm.nodesource.com/setup_18.x | bash - && \
  yum install -y nodejs && \
  yum clean all

# Ensure uv and npx are discoverable by subprocess calls
ENV PATH="/usr/local/bin:${PATH}"

# Verify both are available
RUN uv --version && node --version && npx --version

# Copy the installed dependencies from the build stage
COPY --from=build ${LAMBDA_TASK_ROOT} ${LAMBDA_TASK_ROOT}

# Copy the application code into the final image
COPY . ${LAMBDA_TASK_ROOT}
