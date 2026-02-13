# Chat Automation

AI-powered chat automation platform with an Express API, Next.js frontend, and a LangGraph-based Python agent with MCP tool integrations.

## Architecture

| Service      | Tech                                 | Port   |
| ------------ | ------------------------------------ | ------ |
| **Web**      | Next.js 16, React 19, TailwindCSS    | `3000` |
| **API**      | Express 5, tRPC, Better Auth, Prisma | `8000` |
| **Agent**    | FastAPI, LangGraph, LangChain, MCP   | `8001` |
| **Database** | PostgreSQL 16                        | `5432` |
| **Proxy**    | Nginx (Docker only)                  | `8080` |

```
┌──────────────────────────────────────────────────┐
│                   Nginx (:8080)                  │
│                                                  │
│   /          → Web (:3000)                       │
│   /api/*     → API (:8000)                       │
│   /trpc/*    → API (:8000)                       │
│   /agent/*   → Agent (:8001)                     │
└──────────────────────┬───────────────────────────┘
                       │
              ┌────────┴────────┐
              │  PostgreSQL DB  │
              └─────────────────┘
```

---

## Prerequisites

- **Node.js** ≥ 20
- **pnpm** 10.4.1 (`corepack enable`)
- **Python** ≥ 3.10 + [uv](https://docs.astral.sh/uv/)
- **Docker** & **Docker Compose** (for Docker setup)
- **PostgreSQL** (for local dev, or use Docker)

---

## Environment Setup

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Required variables:

```env
# ─── Database ───
DATABASE_URL="postgresql://postgres:password@localhost:5432/chatautomation?schema=public"

# ─── API / Auth ───
BETTER_AUTH_URL=http://localhost:8000
BETTER_AUTH_SECRET=your_secret_here
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret

# ─── Web ───
NEXT_PUBLIC_API_URL=http://localhost:8000

# ─── Agent ───
GOOGLE_API_KEY=your_gemini_api_key
TAVILY_API_KEY=tvly-your_tavily_api_key
```

---

## Option 1: Docker (Recommended)

The fastest way to get everything running. No local installs needed beyond Docker.

### 1. Setup Environment

```bash
cp .env.example .env
# Edit .env with your API keys and secrets
```

### 2. Build & Run

```bash
docker compose build
docker compose up
```

### 3. Access

- **App**: [http://localhost:8080/](http://localhost:8080/)
- **API**: [http://localhost:8080/api/health](http://localhost:8080/api/health)
- **Agent**: [http://localhost:8080/agent/docs](http://localhost:8080/agent/docs)

> **Note**: First build takes a while (~5–10 min) as it pulls base images and installs all dependencies. Subsequent builds are cached and much faster.

### Docker Commands

```bash
# Build all services
docker compose build

# Start all services
docker compose up

# Start in background
docker compose up -d

# View logs
docker compose logs -f

# View logs for specific service
docker compose logs -f api

# Stop all services
docker compose down

# Stop and remove volumes (reset database)
docker compose down -v

# Rebuild a specific service
docker compose build api
```

---

## Option 2: Local Development (pnpm dev)

Run each service locally with hot-reload for development.

### 1. Install Dependencies

```bash
# Install Node.js dependencies (from repo root)
pnpm install

# Install Python dependencies (agent)
cd apps/agent
uv sync
cd ../..
```

### 2. Setup Database

Make sure PostgreSQL is running locally, then:

```bash
# Copy env files
cp .env.example .env
cp .env.example apps/api/.env
cp apps/agent/chat/.env.example apps/agent/chat/.env

# Edit each .env with your values

# Generate Prisma client & push schema
pnpm --filter @workspace/database run db:generate
pnpm --filter @workspace/database run db:push
```

### 3. Run All Services

```bash
# From repo root — starts web, api, and agent together
pnpm dev
```

This runs `turbo dev` which starts all three apps in parallel:

| Service   | URL                                            | Hot-Reload     |
| --------- | ---------------------------------------------- | -------------- |
| **Web**   | [http://localhost:3000](http://localhost:3000) | ✅ Turbopack   |
| **API**   | [http://localhost:8000](http://localhost:8000) | ✅ tsx watch   |
| **Agent** | [http://localhost:8001](http://localhost:8001) | ✅ fastapi dev |

### Run Individual Services

```bash
# Web only
pnpm --filter web dev

# API only
pnpm --filter api dev

# Agent only
pnpm --filter agent dev

# Web + API (no agent)
turbo dev --filter=web --filter=api
```

---

## Project Structure

```
chat-automation/
├── apps/
│   ├── api/          # Express API server (tRPC + Better Auth)
│   ├── web/          # Next.js frontend
│   └── agent/        # Python AI agent (FastAPI + LangGraph)
├── packages/
│   ├── database/     # Prisma schema & client
│   ├── trpc/         # Shared tRPC routers & adapters
│   ├── ui/           # Shared UI components
│   ├── eslint-config/
│   └── typescript-config/
├── nginx/            # Nginx reverse proxy config
├── docker-compose.yml
├── turbo.json
└── pnpm-workspace.yaml
```

---

## Useful Commands

```bash
# Type checking
pnpm --filter api typecheck
pnpm --filter web typecheck

# Linting
pnpm lint

# Format code
pnpm format

# Database
pnpm --filter @workspace/database run db:studio    # Open Prisma Studio
pnpm --filter @workspace/database run db:migrate   # Run migrations
pnpm --filter @workspace/database run db:push      # Push schema changes
```
