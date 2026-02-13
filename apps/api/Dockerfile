# ============================================
# Stage 1: Base image with pnpm + turbo
# ============================================
FROM node:20-alpine AS base

RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate
RUN pnpm add -g turbo@^2

# ============================================
# Stage 2: Prune monorepo for api
# ============================================
FROM base AS pruned
WORKDIR /app
COPY . .
RUN turbo prune api --docker

# ============================================
# Stage 3: Install dependencies
# ============================================
FROM base AS deps
WORKDIR /app

COPY --from=pruned /app/out/json/ .
COPY --from=pruned /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruned /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml

RUN pnpm install --frozen-lockfile --prefer-offline

# ============================================
# Stage 4: Build
# ============================================
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/ .
COPY --from=pruned /app/out/full/ .

# Generate Prisma client
RUN pnpm --filter @workspace/database run db:generate

# Build all dependencies first, then the api
RUN turbo build --filter=api...

# ============================================
# Stage 5: Production runner
# ============================================
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

ENV NODE_ENV=production

# Copy the full built workspace (api + its workspace deps)
COPY --from=builder /app/ .

# Prune dev dependencies
RUN pnpm prune --prod

EXPOSE 8000

CMD ["pnpm", "--filter", "api", "start"]
