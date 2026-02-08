# Fix Guide: All Current Issues

## Summary of Issues

1. ✅ **FIXED**: Input disabled after first conversation
2. ⚠️ **ACTION REQUIRED**: API server not running (404 errors)
3. ⚠️ **ACTION REQUIRED**: Conversations not saved to database
4. ℹ️ **INFO**: GeneratorExit in LangSmith (harmless)
5. ℹ️ **INFO**: LangGraph checkpoint tables

---

## Issue 1: Input Disabled ✅ FIXED

**Problem**: After first conversation, input was disabled and you couldn't continue chatting.

**Cause**: Input was disabled whenever `workflowStatus === "executing"`, but this includes "waiting for approval" and "completed" states where input should be enabled.

**Fix Applied**: Changed disabled condition to only disable during "planning" phase:

```typescript
// Before:
disabled={
  workflow.workflowStatus === "planning" ||
  workflow.workflowStatus === "executing"
}

// After:
disabled={workflow.workflowStatus === "planning"}
```

**Result**: You can now send new messages even while a workflow is executing or waiting for approval.

---

## Issue 2: API Server Not Running ⚠️ ACTION REQUIRED

**Problem**: All tRPC and auth endpoints returning 404:
```
POST /trpc/conversation.create?batch=1 HTTP/1.1" 404
GET /api/auth/get-session HTTP/1.1" 404
GET /trpc/conversation.list HTTP/1.1" 404
```

**Cause**: API server (Express + tRPC) on port 8001 is not running.

**Fix**:

1. **Created `.env.local` for web app** with correct ports:
   ```bash
   NEXT_PUBLIC_API_URL=http://localhost:8001
   AGENT_API_URL=http://localhost:8000
   ```

2. **Start the API server**:
   ```bash
   # Terminal 1: API Server (port 8001)
   pnpm --filter api dev

   # Terminal 2: Web App (port 3000)
   pnpm --filter web dev

   # Terminal 3: Agent Service (port 8000)
   cd apps/agent/chat
   pnpm dev
   ```

3. **Verify API is running**:
   ```bash
   curl http://localhost:8001/health
   # Should return: {"status":"ok","timestamp":"..."}

   curl http://localhost:8001/trpc
   # Should NOT return 404
   ```

**After starting the API server**, you should see:
- ✅ Conversations saved to database
- ✅ Sidebar shows your chat history
- ✅ Authentication works
- ✅ tRPC endpoints respond

---

## Issue 3: Conversations Not Saved to Database ⚠️ ACTION REQUIRED

**Problem**: No conversations appearing in PostgreSQL `conversations` table.

**Cause**: API server not running (see Issue 2).

**Steps to Fix**:

1. **Start API server** (see above)

2. **Run database migration** (if you haven't already):
   ```bash
   pnpm --filter @workspace/database db:migrate
   ```

   This creates the `conversations` table with the `threadId` field.

3. **Test conversation creation**:
   - Start a new chat
   - Send a message
   - Check your database:
     ```sql
     SELECT * FROM conversations ORDER BY "createdAt" DESC LIMIT 5;
     ```

   You should see:
   ```
   id      | title              | userId | threadId      | createdAt           | updatedAt
   --------+--------------------+--------+---------------+---------------------+-------------
   clx123  | Research best...  | user1  | uuid-thread-1 | 2026-02-08 20:30:00 | 2026-02-08 20:30:00
   ```

4. **Check sidebar**:
   - Reload the web app
   - Sidebar should now show your conversations
   - Click any conversation to load it

---

## Issue 4: GeneratorExit in LangSmith ℹ️ INFO

**What you're seeing**:
```python
GeneratorExit()Traceback (most recent call last):
  File "/langgraph/pregel/main.py", line 2988, in astream
    yield o
GeneratorExit
```

**What this means**:
This is **NOT an error**. It's a normal Python behavior when a generator (the SSE stream) is closed. This happens when:
- The frontend closes the SSE connection after getting all events
- The workflow completes or pauses for approval
- The user navigates away from the page

**Why it appears in LangSmith**:
LangSmith captures all exceptions, including `GeneratorExit`, which is technically an exception but not an error.

**Action**: No action needed. This is harmless and expected behavior.

**How to reduce noise** (optional):
You can filter out `GeneratorExit` in your LangSmith dashboard or ignore it in logs.

---

## Issue 5: LangGraph Checkpoint Tables ℹ️ INFO

**LangGraph creates its own tables automatically** when you first run a workflow with `DATABASE_URL` set.

### Expected Tables:

1. **`checkpoints`** - Main checkpoint data
   ```sql
   thread_id | checkpoint_ns | checkpoint_id | parent_checkpoint_id | ...
   ```

2. **`checkpoint_writes`** - Incremental writes
   ```sql
   thread_id | checkpoint_ns | checkpoint_id | task_id | idx | channel | value
   ```

3. **`checkpoint_blobs`** (optional) - Large state blobs
   ```sql
   thread_id | checkpoint_ns | channel | ...
   ```

### Check if tables exist:

```bash
# Connect to your database
psql $DATABASE_URL

# List tables
\dt checkpoints*
\dt checkpoint_*

# Or query:
SELECT tablename FROM pg_tables
WHERE tablename LIKE 'checkpoint%';
```

### Where messages are stored:

- **LangGraph checkpoints**: Full workflow state including all messages
- **Prisma `conversations` table**: Metadata only (id, title, userId, threadId)
- **Prisma `messages` table**: Currently unused (we use LangGraph as primary store)

### To view a conversation's messages:

```python
# In Python (using LangGraph API)
from langgraph.checkpoint.postgres import PostgresSaver
import psycopg

conn = psycopg.connect(DATABASE_URL)
checkpointer = PostgresSaver(conn)

# Get checkpoint by thread_id
state = checkpointer.get(thread_id="your-thread-id-here")
messages = state["values"]["messages"]  # List of all messages
```

Or query directly:
```sql
SELECT * FROM checkpoints WHERE thread_id = 'your-thread-id-here';
```

---

## Complete Startup Checklist

Run these commands in order:

1. **Set environment variables** (already done):
   - ✅ `apps/web/.env.local` created
   - ✅ API port set to 8001
   - ✅ Agent port set to 8000

2. **Start all services**:
   ```bash
   # Option 1: All at once
   pnpm dev

   # Option 2: Separately (recommended for debugging)
   # Terminal 1
   pnpm --filter api dev

   # Terminal 2
   pnpm --filter web dev

   # Terminal 3
   cd apps/agent/chat && pnpm dev
   ```

3. **Verify services**:
   ```bash
   # API (port 8001)
   curl http://localhost:8001/health

   # Web (port 3000)
   curl http://localhost:3000

   # Agent (port 8000)
   curl http://localhost:8000/health
   ```

4. **Test the flow**:
   - Open `http://localhost:3000/chat`
   - Send a message
   - Wait for workflow to complete
   - ✅ Input should be enabled
   - ✅ Send another message
   - ✅ Conversation should appear in sidebar
   - ✅ Click sidebar item to reload conversation

---

## Expected Behavior After Fixes

### ✅ First Message:
1. You send: "Research best SSO platforms"
2. Workflow executes
3. Conversation saved to database
4. Input remains enabled
5. You can send another message immediately

### ✅ Second Message (Continue Conversation):
1. You send: "Create a Google Doc with those findings"
2. Uses same thread_id (conversation context)
3. Planner sees previous messages
4. Creates plan referencing previous research
5. Input remains enabled

### ✅ Approval Flow:
1. Workflow reaches step requiring approval
2. Status changes to "awaiting_approval"
3. Approval card appears (yellow border, shield icon)
4. **Input is still enabled** - you can send messages while waiting
5. Click "Approve"
6. Workflow continues

### ✅ Sidebar:
1. Shows list of all your conversations
2. Ordered by most recent first
3. Click any conversation to load it
4. Full history displayed
5. Can continue any conversation

---

## Troubleshooting

### Still getting 404 errors?

**Check**:
1. API server is running: `ps aux | grep node | grep api`
2. Port 8001 is listening: `lsof -i :8001`
3. Web app has correct URL: `cat apps/web/.env.local`

**Restart**:
```bash
# Kill all node processes
pkill -f "node.*api"

# Restart API server
pnpm --filter api dev
```

### Conversations still not saving?

**Check**:
1. Database migration ran: `pnpm --filter @workspace/database db:migrate`
2. API server logs show no errors
3. Browser console shows no errors
4. Network tab shows 200 response for `/trpc/conversation.create`

**Debug**:
```bash
# Check database tables
psql $DATABASE_URL -c "\dt conversations"

# Check if API can connect to database
psql $DATABASE_URL -c "SELECT 1"
```

### Input still disabled?

**Check**:
1. File changes applied: `git diff apps/web/app/\(portals\)/chat/page.tsx`
2. Web server restarted after changes
3. Browser cache cleared

**Force refresh**: Cmd/Ctrl + Shift + R

---

## Files Changed

| File | Change | Purpose |
|------|--------|---------|
| `apps/web/.env.local` | Created | Set correct API URL (port 8001) |
| `apps/web/app/(portals)/chat/page.tsx` | Modified | Enable input during workflow execution |
| `apps/web/app/(portals)/chat/[conversationId]/page.tsx` | Modified | Enable input during workflow execution |

---

## Next Steps

1. ✅ Start API server: `pnpm --filter api dev`
2. ✅ Test conversation creation
3. ✅ Verify sidebar shows conversations
4. ✅ Test continuing a conversation
5. ✅ Test approval flow with input enabled
6. ✅ Check database for saved conversations
