# How to Debug Approval Card Issue

## Quick Fix Summary

✅ **Already Applied**:
1. Fixed `use-chat-workflow.ts` to update step status on `approval_required` event
2. Removed background animations
3. Added error handling for database issues

⚠️ **You Need To Do**:
1. Start the API server: `pnpm --filter api dev`
2. Test the approval flow

## Step-by-Step Debugging

### Step 1: Add Debug Component (Optional)

To see exactly what's happening with the workflow state, temporarily add the debug component:

**Edit** `apps/web/app/(portals)/chat/page.tsx`:

```typescript
// Add import at the top
import { WorkflowDebug } from "@/components/workflow-debug";

// Inside the return, after WorkflowTimeline, add:
<WorkflowDebug
  steps={workflow.steps}
  currentStep={workflow.currentStep}
  workflowStatus={workflow.workflowStatus}
/>
```

This will show a floating debug panel in the bottom-right corner showing:
- Workflow status
- Current step
- Which steps are awaiting approval
- Status of all steps with color coding

### Step 2: Start All Services

```bash
# Terminal 1: API Server (MUST BE RUNNING!)
pnpm --filter api dev

# Terminal 2: Web App
pnpm --filter web dev

# Terminal 3: Agent Service
cd apps/agent/chat
pnpm dev
```

### Step 3: Test Approval Flow

1. Open `http://localhost:3000/chat`
2. Send a message that requires approval:
   ```
   Send an email to test@example.com saying "Hello from the workflow system"
   ```
3. Watch the debug panel (if you added it)
4. Look for the approval card to appear

### Step 4: Check Browser Console

Open DevTools → Console and look for:

```javascript
📥 SSE Event: approval_required { step_number: 4, ... }
```

If you see this, the event is being received correctly.

### Step 5: Inspect Step Data

In the console, you can inspect the workflow state:

```javascript
// The debug panel already shows this, but you can also check manually
// Look in React DevTools or add a console.log in use-chat-workflow.ts
```

## Expected Behavior

### What You Should See

1. **Planning Phase**: Steps are created with status `"pending"`
2. **Execution Phase**: Steps change to `"in_progress"` one by one
3. **Approval Required**:
   - Agent sends `approval_required` event
   - Step status changes to `"awaiting_approval"`
   - Yellow/amber card appears with:
     - 🛡️ Shield icon
     - "Requires Approval" heading
     - Description of the step
     - Approval reason
     - Approve and Skip buttons

4. **After Approval**:
   - Click "Approve"
   - Step status changes to `"in_progress"`
   - Workflow continues
   - Step eventually becomes `"completed"`

### What the Approval Card Looks Like

```
┌───────────────────────────────────────────────┐
│ 🛡️ Requires Approval                   [⌄]   │  <- Amber border
├───────────────────────────────────────────────┤
│                                               │
│ Step 4: Send email to test@example.com       │
│                                               │
│ 💡 Why approval is needed:                    │
│ Sending emails requires confirmation to       │
│ prevent accidental or malicious sends.        │
│                                               │
│                          [Skip]  [✓ Approve]  │
│                                               │
└───────────────────────────────────────────────┘
```

## Troubleshooting

### Issue: "Approval card never appears"

**Check**:
1. ✅ API server is running (`curl http://localhost:8000/health`)
2. ✅ Browser console shows `approval_required` event
3. ✅ Debug panel shows step with status `"awaiting_approval"`

**If event is received but card doesn't show**:
- The WorkflowTimeline component should render the approval card when `step.status === "awaiting_approval"`
- Check that the step has `requires_human_approval: true`
- Verify the WorkflowTimeline is receiving the updated steps prop

**If event is NOT received**:
- Check agent logs for `📤 SSE EVENT SENT: type=approval_required`
- Verify the SSE stream is still open (no connection errors)
- Check that the planner is marking steps as `requires_human_approval: true`

### Issue: "tRPC 404 errors"

**Symptoms**:
```
POST /trpc/conversation.create?batch=1 HTTP/1.1" 404
```

**Cause**: API server not running

**Fix**:
```bash
pnpm --filter api dev
```

**Verify**:
```bash
curl http://localhost:8000/trpc
# Should NOT return 404
```

### Issue: "Approval card shows but buttons don't work"

**Check**:
1. Browser console for errors when clicking
2. Network tab for `/api/chat/resume` request
3. Agent logs for resume handling

**Debug**:
```typescript
// In use-chat-workflow.ts, add logging to handleApprove:
const handleApprove = useCallback(async (stepNumber, action, content) => {
  console.log('🔘 Approve clicked:', { stepNumber, action, content });
  // ... rest of the code
}, []);
```

## Remove Debug Component When Done

Once everything is working, remove the `<WorkflowDebug>` component from your chat page.

## Still Having Issues?

If the approval card still doesn't show after following all these steps:

1. **Share these logs**:
   - Browser console output (especially SSE events)
   - Agent console output (especially approval events)
   - Debug panel screenshot (if you added it)

2. **Check these files match the fixes**:
   ```bash
   # Verify the approval_required case is present
   grep -A 10 "approval_required" apps/web/hooks/use-chat-workflow.ts

   # Should show the step status update logic
   ```

3. **Try a minimal test**:
   - Create a simple button that manually sets a step to `awaiting_approval`
   - Verify the card appears
   - This isolates whether the issue is in the event handling or the UI rendering
