# PostgreSQL Persistence - Future Implementation

## Current Status

**Using**: MemorySaver for LangGraph checkpoints
**Why**: PostgreSQL async checkpointer has NotImplementedError with current setup

## What Works Now

✅ **Conversations persist** via tRPC → Prisma → PostgreSQL
✅ **Sidebar shows all conversations**
✅ **Cross-message context works** (within same session)
✅ **Multi-user isolation** via userId in conversations table
✅ **Approval flow works** (as long as agent doesn't restart)

## What Doesn't Persist (with MemorySaver)

⚠️ **Workflow state across agent restarts**
- If agent crashes during a workflow, can't resume exact state
- But can still continue the conversation

⚠️ **Approval states across restarts**
- If agent restarts while waiting for approval, that state is lost
- But conversation history is preserved

## Why PostgreSQL Checkpointer Fails

The issue: `NotImplementedError` in `aget_tuple()` method

**Root cause**: LangGraph's `PostgresSaver` (sync version) doesn't support async operations like `astream()`.

**What we need**: `AsyncPostgresSaver` with proper async connection setup

## How to Fix (For Later)

### Option 1: Use AsyncPostgresSaver (Preferred)

```python
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
import psycopg

async def get_async_checkpointer():
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        # Create async connection
        conn = await psycopg.AsyncConnection.connect(database_url)

        # Create async checkpointer
        checkpointer = AsyncPostgresSaver(conn)
        await checkpointer.setup()

        return checkpointer

    return MemorySaver()
```

**Challenge**: Would need to refactor `DynamicWorkflow` initialization to be async.

### Option 2: Use Sync Methods

Change the workflow to use sync methods instead of async:
- Replace `astream()` with `stream()`
- Replace `ainvoke()` with `invoke()`
- Use regular `PostgresSaver` instead of async version

**Challenge**: Would need to refactor the entire service layer from async to sync.

### Option 3: Use SQLite Checkpointer (Simpler)

```python
from langgraph.checkpoint.sqlite import SqliteSaver

checkpointer = SqliteSaver.from_conn_string("checkpoints.db")
```

**Benefits**:
- No PostgreSQL async issues
- Still persists across restarts
- Simpler setup

**Drawbacks**:
- Need to deploy SQLite file
- Not ideal for distributed deployments

## Recommended Approach

For now: **Keep using MemorySaver**
- Conversations persist via Prisma
- Everything works
- Good enough for development

For production: **Implement AsyncPostgresSaver properly**
1. Refactor `DynamicWorkflow` initialization to async
2. Use `AsyncPostgresSaver` with async connection
3. Properly handle async setup/teardown

## Database Tables (Already Created)

The PostgreSQL checkpoint tables exist but aren't being used:

```sql
SELECT * FROM checkpoints;          -- Empty (using MemorySaver)
SELECT * FROM checkpoint_writes;    -- Empty
SELECT * FROM checkpoint_blobs;     -- Empty
SELECT * FROM checkpoint_migrations; -- Has migration records
```

But conversations table IS being used:
```sql
SELECT * FROM conversations;  -- Has your conversations!
```

## Impact on Your Use Case

**For your chat automation system**: MemorySaver is probably fine!

✅ Users see their conversation history (via Prisma)
✅ Can continue any conversation
✅ Sidebar works perfectly
✅ Multi-user works
✅ Cross-message context works

The only scenario where PostgreSQL checkpointer matters:
- Long-running workflows that need to survive agent restarts
- But most workflows complete quickly anyway!

## When to Implement Full Persistence

Implement AsyncPostgresSaver when:
1. You have workflows that run for hours/days
2. Agent needs to restart frequently without losing workflow state
3. You need audit trail of every workflow step
4. You're deploying to production with high availability requirements

For development and most use cases: **MemorySaver is fine!**

## Files to Modify (When Implementing)

1. `apps/agent/chat/src/chat/graph.py`
   - Implement async `get_checkpointer()`
   - Use `AsyncPostgresSaver`

2. `apps/agent/chat/src/chat/workflow_graph.py`
   - Make initialization async-compatible
   - Handle async setup/teardown

3. `apps/agent/chat/src/chat/service.py`
   - Already uses async methods (good!)
   - No changes needed

## Current Workaround

```python
# In graph.py - current implementation
def get_checkpointer():
    # Use MemorySaver - it works!
    print("📝 Workflow: Using MemorySaver")
    return MemorySaver()
```

This is **production-ready** for most use cases where:
- Workflows complete quickly (< 1 hour)
- Agent restarts are infrequent
- Conversation history (via Prisma) is the main persistence need
