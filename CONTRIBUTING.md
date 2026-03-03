# Contributing to Chat Automation

Thank you for your interest in contributing! This guide will help you get started.

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 20 (see `.nvmrc`)
- **pnpm** 10.x (`corepack enable && corepack prepare pnpm@10.4.1 --activate`)
- **Python** 3.12+ with **uv** (for the agent)
- **Docker** & Docker Compose

### Setup

```bash
# Clone the repo
git clone https://github.com/sayandedotcom/chat-automation.git
cd chat-automation

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env
# Fill in required values in .env

# Start all services
docker compose up
```

## 📁 Project Structure

```
apps/
├── web/        → Next.js 16 frontend (React 19, TailwindCSS)
├── api/        → Express 5 API (tRPC, Passport.js, Prisma)
└── agent/      → FastAPI AI agent (LangGraph, LangChain, MCP)

packages/
├── database/   → Prisma schema & client
├── trpc/       → Shared tRPC routers
├── ui/         → Shared UI components (shadcn/ui)
├── eslint-config/
├── prettier-config/
└── typescript-config/
```

## 🔀 Development Workflow

### 1. Branch Naming

```
feat/short-description
fix/issue-description
chore/tooling-update
docs/what-was-documented
```

### 2. Making Changes

```bash
# Run development servers
pnpm dev

# Run linting
pnpm lint

# Run formatting
pnpm format

# Run type checking
pnpm typecheck

# Run tests
pnpm test
```

### 3. Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/). Commits are enforced via `commitlint` + `husky`.

```
feat(web): add dark mode toggle
fix(api): resolve session cookie domain issue
chore(deps): update prisma to v6
docs: update API endpoint documentation
refactor(agent): simplify planner node logic
ci: add CodeQL security scanning
```

### 4. Pull Requests

- Fill out the PR template completely
- Ensure CI passes (lint, type-check, build)
- Link related issues
- Add screenshots for UI changes

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run tests for a specific app
pnpm --filter web test
pnpm --filter api test

# Type coverage
pnpm type-coverage

# Bundle size check
pnpm bundlewatch

# Dead code detection
pnpm knip
```

## 🐍 Agent Development

The Python agent uses `uv` for dependency management:

```bash
cd apps/agent
uv sync
uv run ruff check     # Linting
uv run ruff format    # Formatting
uv run pytest         # Tests
```

## 📝 Code Style

- **TypeScript/JavaScript**: ESLint + Prettier (configs in `packages/`)
- **Python**: Ruff (linting + formatting)
- **Commits**: Conventional Commits via commitlint
- **Editor**: Settings in `.editorconfig` and `.vscode/`

## 🐛 Reporting Bugs

Use the [Bug Report template](https://github.com/sayandedotcom/chat-automation/issues/new?template=bug_report.yml) to file issues.

## 💡 Suggesting Features

Use the [Feature Request template](https://github.com/sayandedotcom/chat-automation/issues/new?template=feature_request.yml) to propose ideas.

---

Thank you for contributing! 🎉
