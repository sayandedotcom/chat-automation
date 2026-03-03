# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Dependabot configuration for automated dependency updates
- GitHub Issue Templates (Bug Report, Feature Request)
- Pull Request template with service-level checklists
- CODEOWNERS for automated review assignment
- Contributing guidelines (`CONTRIBUTING.md`)
- Security policy (`SECURITY.md`)
- Architecture documentation (`ARCHITECTURE.md`)
- Changeset configuration for monorepo versioning
- Codecov configuration for coverage reporting

## [0.0.1] - 2025-01-01

### Added

- Initial project scaffolding with Turborepo + pnpm workspaces
- **Web**: Next.js 16 frontend with React 19 and TailwindCSS
- **API**: Express 5 server with tRPC, Passport.js (Google OAuth), Prisma ORM
- **Agent**: FastAPI-based AI agent with LangGraph workflow engine
  - Plan → Route → Execute pattern with Human-in-the-Loop (HITL) support
  - MCP tool integrations (Gmail, Google Docs, Sheets, Slides, Drive, Calendar, Notion, Vercel)
  - Smart router for dynamic integration loading
  - Multi-hop tool calling with state-based approval
- **Database**: PostgreSQL 16 with Prisma schema and migrations
- **Infrastructure**: Docker Compose setup with Nginx reverse proxy
- Shared packages: `database`, `trpc`, `ui`, `eslint-config`, `prettier-config`, `typescript-config`
- SST deployment configuration for AWS ECS Fargate
- Husky + commitlint for conventional commits
- ESLint + Prettier + Ruff for code quality
- Bundle size tracking with bundlewatch
- Dead code detection with knip
- Type coverage reporting

[Unreleased]: https://github.com/sayandedotcom/chat-automation/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/sayandedotcom/chat-automation/releases/tag/v0.0.1
