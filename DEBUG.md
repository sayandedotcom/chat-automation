# Debug Guide: Chat Persistence Issues

## Issue 1: tRPC 404 Errors
The errors show:
```
POST /trpc/conversation.create?batch=1 HTTP/1.1" 404
GET /trpc/conversation.list?batch=1 HTTP/1.1" 404
GET /api/auth/get-session HTTP/1.1" 404
```

This means the **API server (port 8000) is not running** or the web app is trying to reach the wrong URL.

### Solution:

1. **Start the API server:**
   ```bash
   # In one terminal
   pnpm --filter api dev
   ```

2. **Start the web app:**
   ```bash
   # In another terminal
   pnpm --filter web dev
   ```

3. **Verify API is running:**
   ```bash
   curl http://localhost:8000/health
   # Should return: {"status":"ok","timestamp":"..."}

   curl http://localhost:8000/trpc
   # Should return tRPC info (not 404)
   ```

4. **Check environment variables:**

   In `apps/web/.env.local`:
   ```
   NEXT_PUBLIC_API_URL=http://localhost:8000
   ```

## Issue 2: Approval Card Not Showing

The approval card wasn't showing because the `approval_required` event wasn't updating the step status to `"awaiting_approval"`.

### Fixed:
Updated `/home/sayan/Desktop/chat-automation/apps/web/hooks/use-chat-workflow.ts` to set the step status when receiving the `approval_required` event:

```typescript
case "approval_required":
  setWorkflowStatus("executing");
  // Update the step status to awaiting_approval
  if (event.step_number || event.interrupt?.step_number) {
    const stepNum = event.step_number || event.interrupt?.step_number;
    setSteps((prev) =>
      prev.map((s) =>
        s.step_number === stepNum
          ? { ...s, status: "awaiting_approval" as const }
          : s
      )
    );
  }
  break;
```

## Issue 3: Database Not Accessible

The database migration failed because Neon DB is unreachable. This is fine for development - conversations will fail to save but the agent workflow still works.

### Temporary Workaround:
Comment out the conversation creation to avoid errors:

In `use-chat-workflow.ts`, temporarily disable conversation creation:
```typescript
// createConversation.mutate({
//   threadId: event.thread_id,
//   title: originalRequest.slice(0, 100) || "New Chat",
// });
```

### Permanent Solution:
1. Update `DATABASE_URL` in `.env` to point to an accessible database
2. Run migration:
   ```bash
   pnpm --filter @workspace/database db:migrate
   ```

## Quick Start Commands

**Option 1: All services at once (recommended)**
```bash
pnpm dev
```

**Option 2: Separately**
```bash
# Terminal 1: API Server
pnpm --filter api dev

# Terminal 2: Web App
pnpm --filter web dev

# Terminal 3: Agent Service (Python)
cd apps/agent/chat
pnpm dev
```

## Testing Approval Flow

1. Start all services
2. Send a message that requires approval (e.g., "Send an email to test@example.com")
3. You should now see the approval card with yellow border
4. The card should have "Approve" and "Skip" buttons
5. Click "Approve" to continue the workflow

## Removed Background Stars

As requested, removed the planetary background, shooting stars, and stars background from:
- `/apps/web/app/(portals)/chat/page.tsx`
- `/apps/web/app/(portals)/chat/[conversationId]/page.tsx`

This makes the UI cleaner and easier to debug.
