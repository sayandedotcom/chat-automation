---
"chat-automation": minor
"web": minor
"api": minor
"agent": minor
"@workspace/database": minor
"@workspace/trpc": minor
"@workspace/ui": minor
---

initial release of chat-automation platform

- AI-powered chat with LangGraph agent (Plan → Route → Execute with HITL)
- Next.js 16 frontend with React 19
- Express 5 API with tRPC, Passport.js, Prisma
- MCP tool integrations (Gmail, Google Docs, Sheets, Slides, Drive, Calendar, Notion, Vercel)
- Shared packages: database, trpc, ui, eslint-config, prettier-config, typescript-config
- Docker Compose setup with Nginx reverse proxy
- SST deployment config for AWS ECS Fargate
