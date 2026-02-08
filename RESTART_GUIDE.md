# Quick Restart Guide

## What Was Fixed

1. ✅ Duplicate conversation creation (unique constraint error)
2. ✅ LangGraph PostgreSQL setup (was falling back to MemorySaver)
3. ℹ️ Workflow "stuck" at approval is **normal** - just click "Approve"!

## How to Apply the Fixes

### Step 1: Restart Agent Service

The agent service needs to be restarted to load the new PostgreSQL checkpointer code:

```bash
# Stop the agent (press Ctrl+C in the terminal running it)
# Then restart:
cd apps/agent/chat
pnpm dev
```

### Step 2: Check the Logs

After restart, you should see:
```
✅ Workflow: PostgreSQL checkpointer setup complete
✅ Workflow: Using PostgreSQL checkpointer
```

**NOT**:
```
⚠️ Workflow: Failed to connect to PostgreSQL
📝 Workflow: Using MemorySaver
```

### Step 3: Test the Workflow

1. Send a new message
2. Check that there are **no unique constraint errors**
3. When workflow reaches approval step:
   - You'll see yellow/amber approval card
   - Click "Approve" button
   - Workflow continues!

## What the Approval Card Looks Like

When the workflow pauses for approval, you should see:

```
┌─────────────────────────────────────────┐
│ 🛡️ Requires Approval            [▼]    │  ← Yellow/amber border
├─────────────────────────────────────────┤
│ Step 3: [description]                   │
│                                         │
│ 💡 Why approval is needed:              │
│ [reason]                                │
│                                         │
│                     [Skip] [✓ Approve]  │
└─────────────────────────────────────────┘
```

**Action**: Click the **"Approve"** button to continue!

## Troubleshooting

### Still seeing MemorySaver?

Check that `DATABASE_URL` is set:
```bash
echo $DATABASE_URL
# Should show your PostgreSQL connection string
```

If not set, add it to your environment:
```bash
export DATABASE_URL="postgresql://user:pass@host:port/database"
```

### Still getting unique constraint errors?

Clear existing conversations:
```sql
psql $DATABASE_URL -c "DELETE FROM conversations;"
```

Then restart the web app:
```bash
pnpm --filter web dev
```

### Approval card not appearing?

1. Check browser console for errors
2. Verify the step object in React DevTools shows:
   ```
   status: "awaiting_approval"
   requires_human_approval: true
   ```
3. Refresh the page

## Quick Test

After restarting:

1. ✅ Agent logs show PostgreSQL checkpointer
2. ✅ Send a message
3. ✅ No unique constraint errors
4. ✅ Workflow executes
5. ✅ Approval card appears (if step requires approval)
6. ✅ Click "Approve"
7. ✅ Workflow continues
8. ✅ Conversation saved to database
9. ✅ Appears in sidebar

Done! Everything should work now.
