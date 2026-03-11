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
pnpm lint:fix       # Auto-fix all linting issues
pnpm format         # Format all code with Prettier
pnpm typecheck      # Type-check all TypeScript
pnpm test           # Run all tests
```

### Single App/Package Commands

```bash
pnpm --filter api test                    # Run tests for api
pnpm --filter web test                    # Run tests for web
pnpm --filter api vitest run src/__tests__/session.service.test.ts  # Single test
pnpm --filter api vitest run -t "pattern" # Run tests matching pattern
pnpm --filter @workspace/database typecheck  # Type-check package
```

### Python Agent Commands

```bash
cd apps/agent
uv sync                                    # Install dependencies
uv run pytest tests/ -v                    # Run all tests
uv run pytest tests/test_file.py -v        # Single test file
uv run pytest -k "test_name" -v            # Run tests matching pattern
uv run ruff check                          # Lint
uv run ruff check --fix                    # Auto-fix lint issues
uv run ruff format                         # Format
uv run fastapi dev chat/src/chat/api.py --host 0.0.0.0 --port 8001
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

**Formatting (Prettier):** Double quotes, semicolons, 2-space indent, 100 char line width, trailing commas (ES5), LF.

**Imports:** Auto-sorted. Order: `react` → `next/*` → third-party → `@workspace/*` → `@/actions/*`, `@/components/*`, `@/lib/*`, `@/config/*`, `@/utils`, `@/store/*`, `@/hooks/*`, `@/types/*` → relative. Use `.js` extension for ES modules. Use `import type` for type-only imports.

```typescript
import type { Request, Response } from "express";

import { z } from "zod";

import { TRPCError } from "@trpc/server";
import { prisma } from "@workspace/database";

import type { SessionUser } from "../@types/index.js";
import { config } from "./config/index.js";
```

**Naming:** Files `kebab-case.ts`, directories `kebab-case`, classes/types `PascalCase`, functions/variables `camelCase`, constants `SCREAMING_SNAKE_CASE`, React components `PascalCase.tsx`

**Types:** Strict mode, explicit return types for exports, prefer `type` for objects, `interface` for extensible contracts, avoid `any`.

**Error Handling:** Use `TRPCError` for API errors, log with context prefix: `console.error("[Session]", error)`

**Async:** Always use async/await over `.then()` chains.

### tRPC Patterns

```typescript
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { publicProcedure, router } from "../server/trpc.js";

export const exampleRouter = router({
  example: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ input }) => {
      // Implementation
    }),
});
```

- Use Zod for input validation
- Throw `TRPCError` for all API errors

### React/Next.js

- Use `"use client"` directive for client components
- Functional components: `export default function Component() {}`
- Hooks at top of component
- Use `useCallback` for functions passed to children

### Python

**Formatting (Ruff):** 88 char line width, 4-space indent, double quotes, space indent.

**Imports:** Standard library → third-party → local imports.

**Naming:** Files `snake_case.py`, functions `snake_case`, classes `PascalCase`, constants `SCREAMING_SNAKE_CASE`, private methods prefix `_`.

**Docstrings:** Triple-double quotes with description.

```python
class ChatService:
    """
    Service for executing dynamic multi-step workflows.
    Usage: service = ChatService(); await service.initialize()
    """
```

**Logging:** `logger = logging.getLogger(__name__)`

**Testing:** `@pytest.mark.asyncio` for async tests, `asyncio_mode = "auto"`.

### Testing (Vitest)

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@workspace/database";

vi.mock("@workspace/database", () => ({
  prisma: { session: { create: vi.fn() } },
}));

describe("Session Service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should create a session", async () => {
    const mockPrisma = vi.mocked(prisma);
    mockPrisma.session.create.mockResolvedValue({ id: "1" });
  });
});
```

- Place tests in `__tests__/` or `*.test.ts` files
- Mock at top of file, clear in `beforeEach`
- Use `vi.mocked()` for typed mock access

## Commit Conventions

Conventional Commits: `type(scope): subject`

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
