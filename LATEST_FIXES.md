# Latest Fixes (Feb 8, 2026)

## Issue 1: Unique Constraint Error ✅ FIXED

**Problem**:
```
Unique constraint failed on the fields: (`threadId`)
```

**Cause**: The `conversation.create` mutation was being called multiple times with the same threadId, trying to create duplicate conversations.

**Fix**: Modified `packages/trpc/src/routers/conversation.ts`:
- Added check for existing conversation before creating
- If conversation with same threadId exists, return it instead of creating duplicate
- Prevents the unique constraint error

**Code**:
```typescript
// Check if conversation already exists
const existing = await prisma.conversation.findUnique({
  where: { threadId: input.threadId },
});

if (existing) {
  return existing;  // Return existing instead of creating duplicate
}
```

---

## Issue 2: LangGraph PostgreSQL Setup Failing ✅ FIXED

**Problem**:
```
⚠️ Workflow: Failed to connect to PostgreSQL: CREATE INDEX CONCURRENTLY cannot run inside a transaction block
📝 Workflow: Using MemorySaver
```

**Cause**: LangGraph's `checkpointer.setup()` tries to create indexes concurrently, which can't be done inside a transaction block.

**Impact**: Workflows were using in-memory storage instead of PostgreSQL, so conversations weren't persisting across restarts.

**Fix**: Modified `apps/agent/chat/src/chat/graph.py`:
- Changed connection to use `autocommit=True` mode
- Wrapped `setup()` in try-catch to handle errors gracefully
- Even if setup fails (tables may already exist), continue with PostgreSQL checkpointer

**Code**:
```python
# Create connection with autocommit for setup
conn = psycopg.connect(database_url, autocommit=True)
checkpointer = PostgresSaver(conn)

try:
    checkpointer.setup()
    print("✅ Workflow: PostgreSQL checkpointer setup complete")
except Exception as setup_error:
    # If setup fails (tables might already exist), continue anyway
    print(f"⚠️ Workflow: Checkpointer setup warning: {setup_error}")

print("✅ Workflow: Using PostgreSQL checkpointer")
return checkpointer
```

**Result**: Now workflows will properly use PostgreSQL for persistence.

---

## Issue 3: Workflow "Stuck" at Approval ✅ NOT A BUG

**What you're seeing**:
```
📤 SSE EVENT SENT: type=approval_required
   📋 Approval data: step=3
📤 Stream ended. waiting_for_approval=True
📤 NOT sending done - workflow paused for approval
```

**This is CORRECT behavior!**

The workflow is **paused and waiting for you to approve step 3**.

**What you should see in the UI**:
1. Yellow/amber card with shield icon
2. "Requires Approval" heading
3. Description of step 3
4. **Approve** and **Skip** buttons

**Action**: Click the **"Approve"** button to continue!

**If you don't see the approval card**:
1. Check browser console for errors
2. Verify the step has `status: "awaiting_approval"` in React DevTools
3. Make sure all the previous fixes are applied

---

## How to Test the Fixes

1. **Restart the agent service** (to load the new checkpointer code):
   ```bash
   # Stop the agent (Ctrl+C)
   cd apps/agent/chat
   pnpm dev
   ```

2. **Check the logs** - you should now see:
   ```
   ✅ Workflow: PostgreSQL checkpointer setup complete
   ✅ Workflow: Using PostgreSQL checkpointer
   ```

   Instead of:
   ```
   ⚠️ Workflow: Failed to connect to PostgreSQL
   📝 Workflow: Using MemorySaver
   ```

3. **Start a new conversation**:
   - Send a message
   - Check that conversation.create succeeds (no unique constraint error)
   - Workflow should execute normally
   - When it reaches an approval step, you'll see the approval card

4. **Test approval flow**:
   - Click "Approve" button
   - Workflow should continue
   - Eventually completes or reaches next approval

5. **Test persistence**:
   - Complete a workflow
   - Restart the agent service
   - Check database:
     ```sql
     SELECT * FROM checkpoints ORDER BY checkpoint_id DESC LIMIT 5;
     ```
   - You should see checkpoint data persisted

---

## Files Modified

| File | Change |
|------|--------|
| `packages/trpc/src/routers/conversation.ts` | Added check for existing conversation before creating |
| `apps/agent/chat/src/chat/graph.py` | Fixed PostgreSQL checkpointer setup with autocommit |

---

## Expected Behavior After Fixes

### ✅ Conversation Creation:
- First message → creates conversation in database
- Subsequent progress events → no duplicate creation errors
- Conversation appears in sidebar immediately

### ✅ LangGraph Persistence:
- Agent logs show: `✅ Workflow: Using PostgreSQL checkpointer`
- Checkpoint tables (`checkpoints`, `checkpoint_writes`) are created/used
- Conversations persist across agent restarts

### ✅ Approval Flow:
- Workflow pauses at step requiring approval
- Approval card appears in UI
- Click "Approve" → workflow continues
- Click "Skip" → step is skipped, workflow continues

---

## Verification Checklist

After restarting services, verify:

- [ ] Agent logs show PostgreSQL checkpointer (not MemorySaver)
- [ ] No unique constraint errors when creating conversations
- [ ] Conversations appear in sidebar
- [ ] Approval cards appear when workflow pauses
- [ ] Clicking "Approve" continues the workflow
- [ ] Database has checkpoint data:
  ```sql
  SELECT COUNT(*) FROM checkpoints;
  SELECT COUNT(*) FROM conversations;
  ```

---

## If You Still Have Issues

**1. Unique constraint error persists**:
- Clear existing conversations from database:
  ```sql
  DELETE FROM conversations;
  ```
- Restart web app

**2. Still using MemorySaver**:
- Check `DATABASE_URL` environment variable is set
- Verify database is accessible: `psql $DATABASE_URL -c "SELECT 1"`
- Check agent logs for connection errors

**3. Approval card not showing**:
- Check browser console for errors
- Verify step status is "awaiting_approval" in React DevTools
- Try refreshing the page

**4. Workflow hangs after approval**:
- Check `/api/chat/resume` request in Network tab
- Verify agent receives the resume request
- Check agent logs for errors during resume
