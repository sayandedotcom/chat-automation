# Architecture

> High-level technical architecture of the Chat Automation platform.

## System Overview

Chat Automation is an AI-powered platform that enables users to interact with third-party services (Gmail, Google Docs, Notion, Vercel, etc.) through a conversational interface. The system uses an AI agent with Human-in-the-Loop (HITL) controls to plan, approve, and execute multi-step workflows.

```
┌─────────────────────────────────────────────────────────────────┐
│                     Client (Browser)                            │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Nginx Reverse Proxy (:8080)                  │
│                                                                 │
│   /           → Web (:3000)     /auth, /trpc, /oauth → API     │
│   /agent/*    → Agent (:8001)                                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
   ┌────────────┐  ┌────────────┐  ┌────────────────┐
   │    Web     │  │    API     │  │     Agent      │
   │  Next.js   │  │  Express   │  │   FastAPI      │
   │  React 19  │  │   tRPC     │  │  LangGraph     │
   │ Tailwind   │  │  Prisma    │  │  LangChain     │
   └────────────┘  └──────┬─────┘  └───────┬────────┘
                          │                │
                          ▼                ▼
                   ┌────────────┐  ┌────────────────┐
                   │ PostgreSQL │  │  MCP Servers   │
                   │    16      │  │ (Tool Layer)   │
                   └────────────┘  └────────────────┘
```

## Monorepo Structure

This is a **Turborepo** monorepo managed with **pnpm workspaces**.

### Apps

| App          | Tech Stack                           | Responsibility                                       |
| ------------ | ------------------------------------ | ---------------------------------------------------- |
| `apps/web`   | Next.js 16, React 19, TailwindCSS    | User interface, chat UI, integration management      |
| `apps/api`   | Express 5, tRPC, Passport.js, Prisma | Authentication, data persistence, OAuth flows        |
| `apps/agent` | FastAPI, LangGraph, LangChain, MCP   | AI planning, tool execution, conversation management |

### Shared Packages

| Package                      | Purpose                                      |
| ---------------------------- | -------------------------------------------- |
| `packages/database`          | Prisma schema, client, and migrations        |
| `packages/trpc`              | Shared tRPC router definitions and adapters  |
| `packages/ui`                | Shared React UI components (shadcn/ui based) |
| `packages/eslint-config`     | Shared ESLint configuration                  |
| `packages/prettier-config`   | Shared Prettier configuration                |
| `packages/typescript-config` | Shared TypeScript `tsconfig` presets         |

## AI Agent Architecture

The agent implements a **Plan → Route → Execute → Loop** pattern:

```
START
  │
  ▼
SMART_ROUTER ── Dynamic integration loading, auth pre-flight
  │
  ▼
PLANNER ── LLM creates structured plan with HITL flags
  │
  ▼
ROUTE_EXECUTOR ── Routes based on requires_human_approval
  │
  ├── approval=false ──→ EXECUTOR (auto) ──→ TOOLS ──┐
  │                                                    │
  └── approval=true ───→ EXECUTOR_WITH_APPROVAL ──→ TOOLS ──┐
                                                              │
                    STEP_COMPLETE ◄───────────────────────────┘
                         │
                    should_execute_next?
                    ├── more steps → (loop back)
                    └── done → END
```

### Key Design Decisions

1. **State-based HITL**: Approval state persists across multi-hop tool calls, avoiding re-prompting
2. **Dynamic MCP loading**: Integrations are loaded at runtime based on user's connected services
3. **Structured planning**: LLM produces structured output (not free-text) for deterministic routing
4. **Checkpointing**: LangGraph's MemorySaver enables conversation persistence and resumability

## Data Flow

```
User Message
  → Web (SSE connection)
    → API (session validation)
      → Agent (LangGraph invoke)
        → Planner (LLM structured output)
          → Executor (tool calls via MCP)
            → External APIs (Gmail, Notion, etc.)
          ← Tool results
        ← Step completion
      ← Streamed response
    ← SSE events
  ← Rendered in chat UI
```

## Authentication & Authorization

- **User Auth**: Google OAuth 2.0 → Passport.js → HTTP-only session cookies
- **Service Auth**: Per-service OAuth flows stored as encrypted tokens in PostgreSQL
- **Agent Auth**: Service credentials fetched at runtime via smart router pre-flight

## Deployment

- **Local**: Docker Compose (all services + PostgreSQL + Nginx)
- **Production**: SST → AWS ECS Fargate with container-based Lambda for the agent

## Technology Decisions

| Decision           | Choice     | Rationale                                      |
| ------------------ | ---------- | ---------------------------------------------- |
| Monorepo tool      | Turborepo  | Fast caching, simple config, good DX           |
| Package manager    | pnpm       | Strict, fast, disk-efficient                   |
| Frontend framework | Next.js 16 | App router, RSC, streaming                     |
| API layer          | tRPC       | End-to-end type safety across web ↔ API        |
| ORM                | Prisma     | Type-safe queries, excellent migration story   |
| AI orchestration   | LangGraph  | Stateful, cyclic graphs with HITL support      |
| Tool protocol      | MCP        | Standardized tool interface, ecosystem support |
| Python tooling     | uv + Ruff  | Fast dependency management and linting         |
