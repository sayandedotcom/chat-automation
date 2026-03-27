# AGENTS.md

Coding agent guidelines for the chat-automation monorepo.

## Project Overview

AI-powered chat automation platform:

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
pnpm --filter api test                                             # Run tests for api
pnpm --filter api vitest run src/__tests__/session.service.test.ts # Single test file
pnpm --filter api vitest run -t "should create a session"          # Run tests matching pattern
pnpm --filter @workspace/database typecheck                        # Type-check package
```

### Python Agent Commands

```bash
cd apps/agent
uv run pytest tests/ -v                    # Run all tests
uv run pytest tests/test_executor.py -v    # Single test file
uv run pytest -k "test_name" -v            # Run tests matching pattern
uv run ruff check                          # Lint
uv run ruff check --fix                    # Auto-fix lint issues
uv run ruff format                         # Format
```

### Database Commands

```bash
pnpm --filter @workspace/database db:generate    # Generate Prisma client
pnpm --filter @workspace/database db:push        # Push schema changes
pnpm --filter @workspace/database db:migrate     # Create migration
```

## Code Style Guidelines

### General Rules

- **NO COMMENTS** in code unless explicitly requested by the user
- **NO emojis** in code unless explicitly requested
- Keep responses concise - prefer 1-3 sentences

### TypeScript/JavaScript

**Formatting (Prettier):** Double quotes, semicolons, 2-space indent, 100 char line width, trailing commas (ES5), LF.

**Imports:** Auto-sorted. Order: `react` → `next/*` → third-party → `@workspace/*` → `@/actions/*`, `@/components/*`, `@/lib/*`, `@/config/*`, `@/utils`, `@/store/*`, `@/hooks/*`, `@/types/*` → relative. Use `.js` extension for ES modules. Use `import type` for type-only imports.

**Naming:** Files `kebab-case.ts`, directories `kebab-case`, classes/types `PascalCase`, functions/variables `camelCase`, constants `SCREAMING_SNAKE_CASE`, React components `PascalCase.tsx`

**Types:** Strict mode, explicit return types for exports, prefer `type` for objects, `interface` for extensible contracts, avoid `any`.

**Error Handling:** Use `TRPCError` for API errors, log with context prefix: `console.error("[Session]", error)`

**Async:** Always use async/await over `.then()` chains.

### tRPC Patterns

```typescript
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { middleware, publicProcedure, router } from "../server/trpc.js";

const customProcedure = publicProcedure.use(
  middleware(({ ctx, next }) => next({ ctx })),
);

export const exampleRouter = router({
  example: customProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ input }) => {
      if (!input.name)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Name required" });
      return { success: true };
    }),
});
```

### React/Next.js

- Use `"use client"` directive for client components
- Functional components: `export default function Component() {}`
- Hooks at top of component
- Use `useCallback` for functions passed to children or used in dependencies

### Python

**Formatting (Ruff):** 88 char line width, 4-space indent, double quotes, space indent. **Imports:** Standard library → third-party → local. **Naming:** Files `snake_case.py`, functions `snake_case`, classes `PascalCase`, constants `SCREAMING_SNAKE_CASE`. **Docstrings:** Triple-double quotes for classes/modules only. **Logging:** `logger = logging.getLogger(__name__)`. **Testing:** Use `@pytest.mark.asyncio` for async tests.

### Testing (Vitest)

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@workspace/database";

vi.mock("@workspace/database", () => ({
  prisma: { session: { create: vi.fn() } },
}));
const mockPrisma = vi.mocked(prisma);

describe("Session Service", () => {
  beforeEach(() => vi.clearAllMocks());
  it("should create a session", async () => {
    mockPrisma.session.create.mockResolvedValue({ id: "1" });
  });
});
```

- Place tests in `__tests__/` or `*.test.ts` files
- Mock at top of file, clear in `beforeEach`
- Use `vi.mocked()` for typed mock access

## Commit Conventions

Conventional Commits: `type(scope): subject`. Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`.

Examples: `feat(web): add dark mode toggle`, `fix(api): resolve session cookie issue`

## Architecture

- **Monorepo**: Turborepo + pnpm workspaces
- **Shared packages**: `@workspace/*` namespace
- **tRPC**: Shared routers in `packages/trpc`
- **Database**: Prisma schema in `packages/database`
- **UI**: Shared components in `packages/ui` (shadcn/ui)

## Environment Variables

Copy `.env.example` to `.env`. Required: `DATABASE_URL`, `SESSION_SECRET` (32+ chars), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_API_KEY`, `TAVILY_API_KEY`
