# ============================================
# Stage 1: Base image with pnpm + turbo
# ============================================
FROM node:20-alpine AS base

RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate
RUN npm install -g turbo@^2

# ============================================
# Stage 2: Prune monorepo for web
# ============================================
FROM base AS pruned
WORKDIR /app
COPY . .
RUN turbo prune web --docker

# ============================================
# Stage 3: Install dependencies
# ============================================
FROM base AS deps
WORKDIR /app

COPY --from=pruned /app/out/json/ .
COPY --from=pruned /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruned /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml

RUN pnpm install --prefer-offline --ignore-scripts

# ============================================
# Stage 4: Build
# ============================================
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/ .
COPY --from=pruned /app/out/full/ .

# Generate Prisma client (needed by trpc/database packages)
RUN pnpm --filter @workspace/database run db:generate

# NEXT_PUBLIC_* vars are inlined at build time by Next.js
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Build the web app directly (Next.js handles TS transpilation of workspace packages)
RUN pnpm --filter web build

# ============================================
# Stage 5: Production runner (Next.js standalone)
# ============================================
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache libc6-compat
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy the standalone output
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000

ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

CMD ["node", "apps/web/server.js"]
