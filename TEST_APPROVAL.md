# Testing Approval Card Display

## What Was Fixed

1. **Approval Status Update**: Modified `use-chat-workflow.ts` to properly set step status to `"awaiting_approval"` when the `approval_required` event is received from the agent.

2. **Background Removal**: Removed planetary background, shooting stars, and stars background for cleaner UI.

3. **Database Error Handling**: Wrapped conversation creation in try-catch to prevent workflow blocking when database is inaccessible.

## How to Test

### Step 1: Start All Services

```bash
# Terminal 1: API Server (must be running for tRPC)
pnpm --filter api dev

# Terminal 2: Web App
pnpm --filter web dev

# Terminal 3: Agent Service
cd apps/agent/chat
pnpm dev
```

### Step 2: Verify Services Are Running

```bash
# Check API server
curl http://localhost:8000/health
# Expected: {"status":"ok","timestamp":"..."}

# Check web app
curl http://localhost:3000
# Expected: HTML response

# Check agent service
curl http://localhost:8000/health
# Expected: 200 OK (from agent's FastAPI)
```

**Note**: Agent and API both run on port 8000 but are separate processes. Make sure both are running.

### Step 3: Test Approval Flow

1. Open browser to `http://localhost:3000/chat`
2. Send a message that requires approval:
   - "Send an email to test@example.com saying hello"
   - "Create a Google Doc with sensitive information"
   - Any action that the planner marks as `requires_human_approval: true`

3. **Expected Behavior**:
   - You should see steps being executed
   - When it reaches a step requiring approval, you'll see:
     - Yellow/amber border around the step card
     - Shield icon with amber color
     - "Requires Approval" text
     - Approve and Skip buttons
     - The approval reason displayed

4. **Click "Approve"**:
   - The step should change status to "in_progress"
   - The workflow should continue executing
   - The step should eventually complete

### Step 4: Check Console Logs

In the browser console, you should see:
```
📥 SSE Event: approval_required {step_number: 4, ...}
```

In the agent console, you should see:
```
📤 SSE EVENT SENT: type=approval_required
📋 Approval data: step=4
```

## Common Issues

### Issue: "404 on /trpc/conversation.create"

**Cause**: API server not running

**Fix**:
```bash
pnpm --filter api dev
```

### Issue: Approval card not showing

**Cause**: The `approval_required` event is not updating the step status

**Fix**: Already applied - check that `use-chat-workflow.ts` has the updated code:
```typescript
case "approval_required":
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

### Issue: Steps show but no approval card

**Debugging**:
1. Open browser DevTools → Console
2. Check the step object: `console.log(workflow.steps)`
3. Look for the step with `status: "awaiting_approval"`
4. If status is still "in_progress" or "pending", the event handler didn't fire

## Manual Test: Force Approval Status

If you want to manually test the approval card UI without running the full workflow:

1. In browser DevTools console:
```javascript
// Get the workflow component state
// (You'll need to add a debug ref to expose this)

// Or modify the code temporarily to force a step to awaiting_approval
```

2. Or add a button in the UI to simulate:
```tsx
<Button onClick={() => {
  setSteps(prev => prev.map((s, i) =>
    i === 0 ? {...s, status: 'awaiting_approval', requires_human_approval: true, approval_reason: 'Test approval'} : s
  ));
}}>
  Test Approval UI
</Button>
```

## Expected Approval Card Appearance

When working correctly, you should see:

```
┌─────────────────────────────────────────────┐
│ 🛡️  Requires Approval            [Expand ▼] │
├─────────────────────────────────────────────┤
│                                              │
│ Step 4: Send email to test@example.com      │
│                                              │
│ Why approval is needed:                      │
│ Sending emails requires user confirmation    │
│                                              │
│ [Skip] [Approve]                            │
│                                              │
└─────────────────────────────────────────────┘
```

- Yellow/amber border
- Shield icon
- Approve button (primary)
- Skip button (secondary)
