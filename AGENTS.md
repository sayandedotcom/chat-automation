# AGENTS.md

Coding agent guidelines for the chat-automation monorepo.

## Project Overview

AI-powered chat automation platform with:

- **Web**: Next.js 16 + React 19 + TailwindCSS (port 3000)
- **API**: Express 5 + tRPC + Passport.js + Prisma (port 8000)
- **Agent**: FastAPI + LangGraph + LangChain + MCP (port 8001)
- **Database**: PostgreSQL 16

## Build/Lint/Test Commands

### Root-level (Turborepo)

```bash
pnpm build          # Build all apps/packages
pnpm dev            # Start all dev servers
pnpm lint           # Lint all (TS + Python agent)
pnpm format         # Format all code
pnpm typecheck      # Type-check all TypeScript
pnpm test           # Run all tests
```

### Single App/Package Commands

```bash
# Run tests for a specific app
pnpm --filter api test
pnpm --filter web test

# Run a single test file
pnpm --filter api vitest run src/__tests__/session.service.test.ts
pnpm --filter web vitest run path/to/test.test.ts

# Run tests in watch mode
pnpm --filter api vitest

# Type-check a specific package
pnpm --filter @workspace/database typecheck
```

### Python Agent Commands

```bash
cd apps/agent
uv sync                        # Install dependencies
uv run pytest tests/ -v        # Run tests
uv run pytest tests/test_smart_router.py -v   # Single test file
uv run ruff check              # Lint
uv run ruff format             # Format
uv run fastapi dev chat/src/chat/api.py --host 0.0.0.0 --port 8001  # Dev server
```

### Database Commands

```bash
pnpm --filter @workspace/database db:generate    # Generate Prisma client
pnpm --filter @workspace/database db:push        # Push schema changes
pnpm --filter @workspace/database db:migrate     # Create migration
pnpm --filter @workspace/database db:studio      # Open Prisma Studio
```

## Code Style Guidelines

### TypeScript/JavaScript

**Formatting (Prettier):** Double quotes, semicolons required, 2-space indentation, 100 char line width, trailing commas (ES5), LF line endings.

**Imports:**

- Use `.js` extension in import paths for ES modules (required for ESM)
- Group: external packages → internal packages (`@workspace/*`) → relative imports

```typescript
import express from "express";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "@workspace/database";
import { config } from "./config/index.js";
```

**Naming:** Files `kebab-case.ts`, directories `kebab-case`, classes/types `PascalCase`, functions/variables `camelCase`, constants `SCREAMING_SNAKE_CASE`, React components `PascalCase.tsx`

**Types:** Use strict mode, explicit return types for exports, prefer `type` for objects, `interface` for extensible contracts, avoid `any`, use `import type` for type-only imports.

**Error Handling:** Use `TRPCError` for API errors, log with context prefix (`console.error("[Session]", error)`), handle async errors gracefully.

**Async:** Always use async/await over `.then()` chains.

### React/Next.js

- Use `"use client"` directive for client components
- Functional components with arrow functions
- Hooks at top of component
- Use `useCallback` for functions passed to children

### Python

**Formatting (Ruff):** 88 char line width, 4-space indentation, double quotes, space indent.

**Imports:** Standard library → third-party → local imports.

**Naming:** Files `snake_case.py`, functions `snake_case`, classes `PascalCase`, constants `SCREAMING_SNAKE_CASE`, private methods prefix `_`.

**Testing:** Use `@pytest.mark.asyncio` for async tests, descriptive test names, docstrings for test groups.

### Testing (Vitest)

- Place tests in `__tests__/` or `*.test.ts` files
- Use `describe`/`it` blocks
- Mock at top of file with `vi.mock()`
- Clear mocks in `beforeEach`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@workspace/database", () => ({
  prisma: { session: { create: vi.fn() } },
}));

describe("Session Service", () => {
  beforeEach(() => vi.clearAllMocks());
  it("should create a session", async () => {
    /* ... */
  });
});
```

## Commit Conventions

Follow Conventional Commits: `type(scope): subject`

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`

Examples: `feat(web): add dark mode toggle`, `fix(api): resolve session cookie issue`

## Architecture

- **Monorepo**: Turborepo + pnpm workspaces
- **Shared packages**: `@workspace/*` namespace
- **tRPC**: Shared routers in `packages/trpc`
- **Database**: Prisma schema in `packages/database`
- **UI**: Shared components in `packages/ui` (shadcn/ui)

## Environment Variables

Required in `.env`: `DATABASE_URL`, `SESSION_SECRET` (32+ chars), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_API_KEY`, `TAVILY_API_KEY`
