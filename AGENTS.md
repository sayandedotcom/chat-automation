# AGENTS.md

Coding agent instructions for this monorepo-based chat automation system.

## Project Overview

Monorepo with pnpm + Turborepo containing:

- **apps/web**: Next.js 16 (App Router) + React 19 + TailwindCSS + shadcn/ui
- **apps/api**: Express 5.x + tRPC + Better Auth
- **apps/agent**: Python FastAPI + LangGraph + MCP tools
- **packages/trpc**: Shared tRPC definitions (central nervous system)
- **packages/database**: Prisma schema and client
- **packages/ui**: shadcn/ui components

## Build/Lint/Test Commands

```bash
# Development (starts all services)
pnpm dev

# Build
pnpm build                    # All packages
pnpm --filter web build       # Specific app

# Linting
pnpm lint                     # All packages
pnpm --filter web lint        # Specific app
pnpm --filter web lint:fix    # Fix lint errors

# Type checking
pnpm --filter web typecheck   # Next.js app
pnpm --filter api typecheck   # API server

# Formatting
pnpm format                   # Format all TS/TSX/MD files

# Database (Prisma)
pnpm --filter @workspace/database db:generate  # After schema changes
pnpm --filter @workspace/database db:push      # Dev: push schema
pnpm --filter @workspace/database db:migrate   # Prod: migrations

# Python Agent
cd apps/agent && pnpm dev     # Start FastAPI (uv run fastapi run)
cd apps/agent/chat && uv run pytest  # Run Python tests (if any)
```

## Code Style Guidelines

### TypeScript/TSX

**Imports**: Use `.js` extensions for local imports (ESM requirement):

```typescript
import { router } from "../server/trpc.js";
import { authRouter } from "./auth.js";
```

**Import Order**: External packages first, then internal:

```typescript
import { z } from "zod";
import { router, publicProcedure } from "../server/trpc.js";
```

**File Headers**: Use JSDoc blocks for file/module documentation:

```typescript
/**
 * Greeting router - example procedures
 */
```

**Types**:

- Use Zod for runtime validation and type inference
- Prefer `type` for object types, `interface` for extensibility
- Enable `noUncheckedIndexedAccess` - always handle undefined

**Naming**:

- `camelCase` for variables, functions, props
- `PascalCase` for components, types, classes, Zod schemas
- `kebab-case` for file names
- `SCREAMING_SNAKE_CASE` for env constants

**React**:

- Use `"use client"` directive for client components
- Destructure props with TypeScript: `{ children }: { children: React.ReactNode }`
- Use shadcn/ui components from `@workspace/ui/components/...`

**tRPC Routers**:

```typescript
export const myRouter = router({
  myQuery: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      return { result: input.id };
    }),
});
```

**Error Handling**:

- Use `TRPCError` for tRPC procedures
- Add stack traces in development only
- Always handle errors in async operations

### Python

**Imports**: stdlib → external → internal (with blank lines between):

```python
import os
import logging

from fastapi import FastAPI
from pydantic import BaseModel

from chat.utils.mcp_client import TAVILY_API_KEY
```

**Docstrings**: Use triple-quoted docstrings for modules, classes, functions:

```python
def add_artifacts(existing: List[dict], new: List[dict]) -> List[dict]:
    """Reducer for artifacts: appends new artifacts to existing ones."""
    return (existing or []) + (new or [])
```

**Pydantic Models**: Use `Field()` with descriptions:

```python
class SearchResultItem(BaseModel):
    """Structured search result from Tavily or similar."""
    title: str = Field(..., description="Title of the search result")
    url: str = Field(..., description="URL of the search result")
```

**Naming**: `snake_case` for functions/variables, `PascalCase` for classes.

**Logging**: Configure at module level:

```python
logging.basicConfig(level=logging.INFO, format="%(name)s %(levelname)s %(message)s")
```

## Key Patterns

### tRPC End-to-End Type Safety

1. Define router in `packages/trpc/src/routers/`
2. Add to `packages/trpc/src/routers/index.ts`
3. Use `useTRPC()` hook in frontend - types auto-propagate

### Protected Procedures

```typescript
import { protectedProcedure } from "../server/trpc.js";

export const myRouter = router({
  secretData: protectedProcedure.query(({ ctx }) => {
    // ctx.user is guaranteed to exist
    return { userId: ctx.user.id };
  }),
});
```

### Express Middleware Ordering (Critical)

CORS → Better Auth handler → `express.json()` → other middleware. Auth breaks if body parsing comes before it.

### Monorepo Package References

Use `workspace:*` in package.json:

```json
"dependencies": {
  "@workspace/trpc": "workspace:*"
}
```

## Environment

- **Node**: >= 20
- **pnpm**: 10.4.1
- **Python**: >= 3.10
- **Python PM**: uv

## Common Gotchas

- Express 5.x uses `/*splat` instead of `/*` for catch-all routes
- Prisma client generated to non-default path: `packages/database/src/generated/client`
- Agent and API both run on port 8000 (separate processes)
- tRPC uses SuperJSON for Date/Map/Set serialization
