# Fix: NotImplementedError in LangGraph Checkpointer

## Error
```python
NotImplementedError()
Traceback (most recent call last):
  File "langgraph/pregel/main.py", line 2891, in astream
    async with AsyncPregelLoop(
  File "langgraph/pregel/_loop.py", line 1264, in __aenter__
    saved = await self.checkpointer.aget_tuple(self.checkpoint_config)
  File "langgraph/checkpoint/base/__init__.py", line 276, in aget_tuple
    raise NotImplementedError
```

## Root Cause

The PostgreSQL checkpointer was using an `autocommit=True` connection for all operations. This connection mode doesn't support LangGraph's async checkpoint methods like `aget_tuple()`.

**The issue**:
- Setup (creating tables/indexes) needs `autocommit=True` to avoid transaction conflicts
- Normal operations (reading/writing checkpoints) need a regular transaction-based connection
- We were using autocommit for both, causing the NotImplementedError

## Fix Applied

**File**: `apps/agent/chat/src/chat/graph.py`

Changed the checkpointer initialization to:
1. **Setup phase**: Use autocommit connection to create tables
2. **Close** the setup connection
3. **Normal operations**: Create new regular connection for the actual checkpointer

**Code**:
```python
# First, try to setup tables with autocommit connection
try:
    setup_conn = psycopg.connect(database_url, autocommit=True)
    setup_checkpointer = PostgresSaver(setup_conn)
    setup_checkpointer.setup()
    setup_conn.close()  # Close setup connection
    print("✅ PostgreSQL checkpointer setup complete")
except Exception as setup_error:
    # Tables may already exist - continue anyway
    print(f"⚠️ Setup warning: {setup_error}")

# Now create the actual checkpointer with regular connection
conn = psycopg.connect(database_url)  # Regular connection (not autocommit)
checkpointer = PostgresSaver(conn)
print("✅ Using PostgreSQL checkpointer")
return checkpointer
```

## How to Apply

1. **Restart the agent service**:
   ```bash
   # Stop the agent (Ctrl+C)
   cd apps/agent/chat
   pnpm dev
   ```

2. **Check the logs** - should see:
   ```
   ✅ Workflow: PostgreSQL checkpointer setup complete
   ✅ Workflow: Using PostgreSQL checkpointer
   ```

3. **Test workflow execution** - should work without NotImplementedError

## Expected Behavior After Fix

### ✅ First Run (Tables Don't Exist):
```
✅ Workflow: PostgreSQL checkpointer setup complete
✅ Workflow: Using PostgreSQL checkpointer
```

### ✅ Subsequent Runs (Tables Already Exist):
```
⚠️ Workflow: Checkpointer setup warning (tables may already exist): ...
✅ Workflow: Using PostgreSQL checkpointer
```

### ✅ Workflow Execution:
- No NotImplementedError
- Checkpoints saved to PostgreSQL
- Conversations persist across restarts
- You can resume paused workflows

## Verification

After restarting, test the workflow:

1. Send a message
2. Workflow executes without errors
3. Check LangSmith - no NotImplementedError
4. Check database:
   ```sql
   SELECT COUNT(*) FROM checkpoints;
   ```
   Should show checkpoint records

## Why This Happens

LangGraph's PostgreSQL checkpointer has two modes:

1. **Setup mode** (creating schema):
   - Needs `autocommit=True`
   - Runs `CREATE TABLE`, `CREATE INDEX CONCURRENTLY`
   - Can't be in a transaction block

2. **Normal mode** (reading/writing checkpoints):
   - Needs regular transactional connection
   - Uses async methods (`aget_tuple`, `aput`, etc.)
   - Requires transaction support

Our previous fix used autocommit for both, which broke the async methods.

## Alternative Approach (If This Still Fails)

If you still get errors, you can manually create the tables once, then skip setup:

```bash
# Connect to your database
psql $DATABASE_URL

# Run the LangGraph schema
CREATE TABLE IF NOT EXISTS checkpoints (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  parent_checkpoint_id TEXT,
  type TEXT,
  checkpoint BYTEA NOT NULL,
  metadata BYTEA NOT NULL,
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);

CREATE TABLE IF NOT EXISTS checkpoint_writes (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  channel TEXT NOT NULL,
  type TEXT,
  value BYTEA,
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);

CREATE INDEX IF NOT EXISTS checkpoints_thread_id_idx ON checkpoints(thread_id);
```

Then modify `graph.py` to skip setup:
```python
conn = psycopg.connect(database_url)
checkpointer = PostgresSaver(conn)
# Don't call setup() - tables already exist
return checkpointer
```

But the current fix should work without manual intervention!
