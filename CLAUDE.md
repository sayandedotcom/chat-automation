# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

Turborepo monorepo with pnpm workspaces. Three apps: a Next.js frontend (`apps/web`), an Express 5 + tRPC API (`apps/api`), and a FastAPI + LangGraph AI agent (`apps/agent/chat`). Shared packages live in `packages/` (database, trpc, ui, configs).

## Commands

### Root-level (run from repo root)

```bash
pnpm dev          # Start all services in parallel with hot reload
pnpm build        # Turbo-cached build of all packages
pnpm test         # Run all Vitest + pytest tests
pnpm lint         # ESLint + Ruff checks
pnpm format       # Prettier + Ruff formatting
pnpm db:push      # Apply Prisma schema changes (no migration file)
pnpm db:migrate   # Create and apply a new Prisma migration
pnpm db:studio    # Open Prisma Studio
```

### Filtering by workspace

```bash
pnpm --filter api test
pnpm --filter web test
pnpm --filter @workspace/database db:generate
```

### Single test / pattern

```bash
# TypeScript (Vitest)
pnpm --filter api test -- src/__tests__/session.service.test.ts
pnpm --filter api test -- -t "pattern"

# Python (pytest via uv)
cd apps/agent/chat && uv run pytest tests/ -v
cd apps/agent/chat && uv run pytest tests/test_classifier.py -v
cd apps/agent/chat && uv run pytest -k "test_name" -v
```

### Docker (all services at http://localhost:8080)

```bash
docker compose up
```

## Architecture

### Nginx Gateway

All traffic in Docker goes through Nginx (`:8080`). Routes:

- `/auth/*`, `/trpc/*`, `/oauth/*`, `/chat/stream` → API (`:8000`)
- `/agent/*` → Agent (`:8001`, path rewritten)
- `/` → Web (`:3000`)

For local `pnpm dev`, services run directly on their ports (web: 3000, api: 8000, agent: 8001).

### API (`apps/api`)

Express 5 + tRPC with end-to-end TypeScript type safety. Authentication via Passport.js (Google OAuth 2.0) with JWE-encrypted session cookies (`jose`). Database access through Prisma ORM with a PostgreSQL adapter. tRPC procedures are `publicProcedure` or `protectedProcedure` (auth guard). Zod validates all inputs at API boundaries.

### Agent (`apps/agent/chat`)

FastAPI service with LangGraph stateful workflows. The graph executes:

```
SMART_ROUTER → PLANNER → ROUTE_EXECUTOR → EXECUTOR / EXECUTOR_WITH_APPROVAL → STEP_COMPLETE → (loop or END)
```

- **Smart Router** (`nodes.py:smart_router_node`): Calls `await classify_integrations()` to identify which MCP tool servers to load, then verifies user has connected those services.
- **Two-phase classifier** (`classifier.py`): NLP stemmer + rapidfuzz phrase matching first; Gemini Flash LLM fallback only for low-confidence results. Config in `integration_config.yaml`.
- **Planner**: Outputs structured JSON including a `requires_human_approval` flag per step.
- **HITL**: State-based approval that persists across the workflow — approval state is stored in LangGraph state, not re-prompted.
- **Checkpointing**: `AsyncPostgresSaver` (from `langgraph.checkpoint.postgres.aio`) — **not** sync `PostgresSaver`, which raises `NotImplementedError` with `astream()`.

### Database (`packages/database`)

Prisma schema is the single source of truth. Run `db:generate` after schema changes to regenerate the client. Migrations are versioned under `prisma/migrations/`.

### Shared Packages

- `packages/trpc` — shared tRPC router types consumed by both `api` and `web`
- `packages/ui` — shadcn/ui-based React components used by `web`
- `packages/typescript-config` — base `tsconfig.json` presets

## Key Implementation Notes

### Frontend SSE Streaming

Never call `router.replace()` during active SSE streaming — it unmounts the component and kills the stream. Use `window.history.replaceState(null, "", url)` to update the URL without a React remount.

### Classifier / Stemmer

Only strip **inflectional** suffixes (`-s`, `-es`, `-ing`, `-ed`, `-ly`, `-ies`, `-ied`). Do not strip derivational suffixes (`-ment`, `-tion`, `-ness`, etc.) — they cause singular and plural forms to stem differently. The `-er` suffix is also excluded for the same reason (e.g., "folder" → "fold" vs. "folders" → "folder"). Check sibilant + `-es` and `ies/ied` cases before generic rules. Apply `min_stem_length` restrictions for ambiguous suffixes.

### Python tooling

Agent uses `uv` for dependency management. Run Python commands as `uv run <cmd>` inside `apps/agent/chat/`. Ruff is the linter and formatter (88-char line width).

### Commit style

Conventional Commits enforced by commitlint: `type(scope): message`. Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.
