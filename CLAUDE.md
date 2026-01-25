# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a monorepo-based chat automation system with AI workflow capabilities. The stack combines:
- **Web**: Next.js 16 (App Router) with React 19, TailwindCSS, and shadcn/ui
- **API**: Express server exposing tRPC endpoints
- **Agent**: Python FastAPI service with LangGraph-based workflow orchestration
- **Shared tRPC**: Centralized type-safe API layer connecting frontend and backend

## Package Manager & Monorepo

- **Package Manager**: pnpm (version 10.4.1)
- **Build System**: Turborepo
- **Node Version**: >= 20

The workspace is organized as:
```
apps/
  ├── web/          # Next.js frontend
  ├── api/          # Express + tRPC API server
  └── agent/        # Python FastAPI agent service
packages/
  ├── database/     # Prisma schema and client (@workspace/database)
  ├── ui/           # shadcn/ui components
  ├── trpc/         # Shared tRPC definitions and client
  ├── typescript-config/
  └── eslint-config/
```

## Common Commands

### Development
```bash
# Start all services in development mode
pnpm dev

# Start a specific app
pnpm --filter web dev
pnpm --filter api dev

# Start the agent service (Python FastAPI)
cd apps/agent
pnpm dev  # Runs: uv run fastapi run --host 0.0.0.0 --port 8000
```

### Building
```bash
# Build all packages
pnpm build

# Build specific app
pnpm --filter web build
pnpm --filter api build
```

### Linting & Type Checking
```bash
# Lint all packages
pnpm lint

# Type check Next.js app
pnpm --filter web typecheck

# Type check API
pnpm --filter api typecheck
```

### Code Formatting
```bash
# Format all TypeScript/TSX/Markdown files
pnpm format
```

### Database (Prisma)
```bash
# Generate Prisma client after schema changes
pnpm --filter @workspace/database db:generate

# Push schema changes to database (development)
pnpm --filter @workspace/database db:push

# Create and run migrations (production)
pnpm --filter @workspace/database db:migrate

# Open Prisma Studio (database GUI)
pnpm --filter @workspace/database db:studio

# Seed the database
pnpm --filter @workspace/database db:seed
```

## Architecture

### Database (@workspace/database)

The `packages/database` package provides centralized database access via Prisma:
- **Schema**: `packages/database/prisma/schema.prisma` - defines all models
- **Client**: Exported from `@workspace/database` for use in API and tRPC

**Key models:**
- **Authentication**: `User`, `Account`, `Session`, `VerificationToken` (for better-auth)
- **Chat**: `Conversation`, `Message`
- **Workflows**: `Workflow`, `WorkflowStep`, `WorkflowRun`
- **Integrations**: `Integration` (OAuth tokens for Gmail, Notion, Slack, etc.)

**Usage:**
```typescript
import { prisma } from "@workspace/database";

const user = await prisma.user.findUnique({ where: { id } });
```

### Authentication (better-auth)

Authentication is implemented using better-auth with Google OAuth:
- **Server** (`apps/api/src/lib/auth.ts`): Configures better-auth with Prisma adapter
- **Client** (`apps/web/lib/auth-client.ts`): React hooks for auth state
- **tRPC Integration**: `authRouter` provides `getSession` (public) and `getUser` (protected) procedures

**Usage in components:**
```typescript
import { useSession, signIn, signOut } from "@/lib/auth-client";

const { data: session } = useSession();
await signIn.social({ provider: "google" });
```

**Environment variables required:**
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `BETTER_AUTH_URL` - Base URL for auth (default: http://localhost:8000)

### tRPC Integration (@workspace/trpc)

The `packages/trpc` package is the **central nervous system** of this project. It provides:
- Type-safe API definitions shared between frontend and backend
- Server-side router configuration with context and middleware
- React hooks for client-side data fetching
- Express adapter for mounting tRPC on the API server

**Key exports:**
- `packages/trpc/src/index.ts` - Main entry point, re-exports server utilities
- `packages/trpc/src/server/trpc.ts` - Core tRPC initialization with SuperJSON transformer, logging middleware
- `packages/trpc/src/routers/index.ts` - Root router combining all sub-routers (add new routers here)
- `packages/trpc/src/client/react.tsx` - React Query integration with `TRPCProvider` and `useTRPC` hooks
- `packages/trpc/src/adapters/express.ts` - Express middleware for mounting tRPC

**Usage in apps:**
- **API** (`apps/api/src/index.ts`): Mounts tRPC via `mountTRPC(app)` on `/trpc` endpoint
- **Web** (`apps/web`): Uses `TRPCProvider` in `components/providers.tsx` to wrap the app, enabling hooks like `useTRPC()` in client components

**Adding new tRPC endpoints:**
1. Create a new router in `packages/trpc/src/routers/` (follow `greeting.ts` or `auth.ts` as examples)
2. Add it to `packages/trpc/src/routers/index.ts` in the `appRouter`
3. The type safety will automatically propagate to the frontend

**Protected procedures:**
Use `protectedProcedure` for authenticated endpoints:
```typescript
import { protectedProcedure } from "../server/trpc.js";

export const myRouter = router({
  secretData: protectedProcedure.query(({ ctx }) => {
    // ctx.user is guaranteed to exist
    return { userId: ctx.user.id };
  }),
});
```

### Web App (Next.js)

- **Framework**: Next.js 16 with App Router (`apps/web/app/`)
- **Styling**: TailwindCSS with shadcn/ui components from `@workspace/ui`
- **State Management**: React Query (via tRPC) + next-themes for theming
- **Key directories**:
  - `app/(portals)/` - Route groups for different app sections (chat, greetings, integrations, workflow)
  - `components/` - Shared React components
  - `lib/` - Utility functions
  - `hooks/` - Custom React hooks

**Adding shadcn/ui components:**
```bash
pnpm dlx shadcn@latest add button -c apps/web
```
This places components in `packages/ui/src/components` and they can be imported as:
```tsx
import { Button } from "@workspace/ui/components/button"
```

### API Server (Express + tRPC)

- **Location**: `apps/api/src/index.ts`
- **Port**: 8000 (configurable via `PORT` env var)
- **CORS**: Configured to allow `http://localhost:3000` with credentials
- **Security**: Helmet middleware with CSP disabled
- **Health check**: `GET /health` returns `{ status: "ok", timestamp: "..." }`

The API server is a thin wrapper around tRPC - all business logic should be in tRPC routers.

### Agent Service (Python + LangGraph)

- **Location**: `apps/agent/chat/`
- **Framework**: FastAPI with LangGraph for workflow orchestration
- **Port**: 8000 (same as API, but runs separately)
- **Python Version**: >= 3.10
- **Package Manager**: uv (via `pyproject.toml`)

**Key components:**
- `src/chat/api.py` - FastAPI endpoints for chat and workflow execution
- `src/chat/workflow_graph.py` - LangGraph state machine implementing Plan → Route → Execute pattern
- `src/chat/workflow_nodes.py` - Node implementations for workflow steps
- `src/chat/workflow_service.py` - Service layer for workflow execution
- `src/chat/service.py` - Chat service with MCP tool integration
- `src/chat/utils/mcp_client.py` - MCP (Model Context Protocol) client for tool integration

**Workflow Architecture:**
The agent uses LangGraph to create dynamic multi-step workflows with Human-in-the-Loop (HITL) capabilities:
1. **Planner**: LLM creates a structured plan with steps marked for human approval
2. **Router**: Routes steps to appropriate executor based on approval requirements
3. **Executor**: Executes steps automatically or requests approval via `interrupt()`
4. **Checkpointing**: Supports PostgreSQL (via `DATABASE_URL`) or in-memory checkpointing

**Key endpoints:**
- `POST /chat` - Single-turn chat interaction
- `POST /workflow` - Execute multi-step workflow
- `POST /workflow/stream` - Stream workflow progress with SSE
- `POST /workflow/resume` - Resume paused workflow with HITL decision (approve/edit/skip)
- `POST /workflow/retry` - Retry failed workflow step
- `GET /workflow/status/{thread_id}` - Get workflow state

**Deployment:**
The agent is configured for AWS Lambda deployment via SST (`apps/agent/sst.config.ts`):
```bash
# Deploy to AWS (requires SST CLI)
cd apps/agent
sst deploy
```

## Environment Variables

Each app has its own `.env.example` file showing required configuration. Key variables:
- **Web**: `NEXT_PUBLIC_API_URL` (API server URL)
- **API**: `PORT`, `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_URL`
- **Database**: `DATABASE_URL` (PostgreSQL connection string)
- **Agent**: `DATABASE_URL` (PostgreSQL for checkpointing), various API tokens for integrations

## Development Workflow

1. **Install dependencies**: `pnpm install` (at root)
2. **Start all services**: `pnpm dev`
   - Web runs on port 3000
   - API runs on port 8000
   - Agent runs on port 8000 (separate process)
3. **Make changes**: Edit files in respective app directories
4. **Type checking**: Changes to `packages/trpc` automatically propagate types to both frontend and backend

## Testing

This project does not currently have a formal test suite configured. When adding tests:
- Use the appropriate testing framework for each platform (Jest/Vitest for TypeScript, pytest for Python)
- Add test scripts to relevant `package.json` files
- Update Turborepo's `turbo.json` to include test tasks

## Key Architectural Patterns

### Type Safety Across Stack
The entire stack shares types through tRPC's `AppRouter`. When you add a procedure:
1. Define input/output schemas with Zod in the router
2. Types automatically flow to frontend via `useTRPC()` hooks
3. No manual type synchronization needed

### Monorepo Workspace References
Internal packages are referenced using `workspace:*` protocol in package.json:
```json
"dependencies": {
  "@workspace/trpc": "workspace:*"
}
```

### LangGraph Workflow Pattern
The agent implements a sophisticated workflow engine:
- **Stateful execution**: All workflow state persisted to checkpointer (PostgreSQL or memory)
- **Human-in-the-Loop**: Steps can pause for approval using LangGraph's `interrupt()` mechanism
- **Resumable**: Workflows can be resumed after interruption with user decisions
- **Streaming**: Real-time progress updates via Server-Sent Events (SSE)

### Component Architecture (Web)
- Route groups with `(portals)` for logical app sections
- shadcn/ui components in shared `packages/ui` package
- Global styles in `@workspace/ui/globals.css`
- TRPCProvider + ThemeProvider wrapped in `components/providers.tsx`

## Port Configuration

- **Web (Next.js)**: 3000
- **API (Express)**: 8000
- **Agent (FastAPI)**: 8000 (separate from API)

All services can be customized via environment variables.
