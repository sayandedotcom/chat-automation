# Fixes Applied for Approval Card Issue

## Problem Summary

1. ❌ Approval card not showing in UI despite `approval_required` event being sent from agent
2. ❌ tRPC endpoints returning 404 errors
3. ❌ Background animations requested to be removed

## Fixes Applied

### 1. ✅ Fixed Approval Card Display

**File**: `apps/web/hooks/use-chat-workflow.ts`

**Issue**: When the `approval_required` SSE event was received, the step status wasn't being updated to `"awaiting_approval"`, so the WorkflowTimeline component didn't know to render the approval card.

**Fix**: Added logic to update the step status when receiving the `approval_required` event:

```typescript
case "approval_required":
  setWorkflowStatus("executing");
  // NEW: Update the step status to awaiting_approval
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

**Why This Works**:
- The `WorkflowTimeline` component checks `step.status === "awaiting_approval"` to render the approval card
- Previously, the status remained as `"in_progress"` or `"pending"` even when approval was required
- Now the status is explicitly set to `"awaiting_approval"` when the event arrives

### 2. ✅ Removed Background Animations

**Files**:
- `apps/web/app/(portals)/chat/page.tsx`
- `apps/web/app/(portals)/chat/[conversationId]/page.tsx`

**Changes**: Removed imports and components:
- `PlanetaryBackground`
- `ShootingStars`
- `StarsBackground`

**Result**: Clean, simple black background (`bg-[#0a0a0a]`) without distracting animations.

### 3. ✅ Added Database Error Handling

**File**: `apps/web/hooks/use-chat-workflow.ts`

**Issue**: When database is inaccessible, conversation creation was blocking/failing

**Fix**: Wrapped conversation creation in try-catch:

```typescript
try {
  createConversation.mutate({
    threadId: event.thread_id,
    title: originalRequest.slice(0, 100) || "New Chat",
  });
} catch (err) {
  console.warn("Failed to create conversation record:", err);
  // Continue workflow anyway
}
```

**Result**: Workflow continues even if database is down (for development/testing)

### 4. ⚠️  tRPC 404 Errors - Requires Manual Fix

**Issue**: The 404 errors indicate the API server isn't running:
```
POST /trpc/conversation.create?batch=1 HTTP/1.1" 404
GET /trpc/conversation.list HTTP/1.1" 404
GET /api/auth/get-session HTTP/1.1" 404
```

**Root Cause**: API server (port 8000) not running

**Solution**: You need to start the API server:

```bash
# Option 1: Start all services together
pnpm dev

# Option 2: Start API separately
pnpm --filter api dev
```

**Verification**:
```bash
curl http://localhost:8000/health
# Should return: {"status":"ok","timestamp":"..."}

curl http://localhost:8000/trpc
# Should return tRPC endpoint info (not 404)
```

## Testing Checklist

To verify the fixes work:

- [ ] Start API server: `pnpm --filter api dev`
- [ ] Start web app: `pnpm --filter web dev`
- [ ] Start agent service: `cd apps/agent/chat && pnpm dev`
- [ ] Open `http://localhost:3000/chat`
- [ ] Send message requiring approval (e.g., "Send an email to test@example.com")
- [ ] Verify approval card appears with:
  - [ ] Yellow/amber border
  - [ ] Shield icon
  - [ ] "Requires Approval" text
  - [ ] Approve and Skip buttons
  - [ ] Approval reason displayed
- [ ] Click "Approve" button
- [ ] Verify workflow continues executing

## Code Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `apps/web/hooks/use-chat-workflow.ts` | Modified | Added step status update on `approval_required` event |
| `apps/web/hooks/use-chat-workflow.ts` | Modified | Added try-catch for conversation creation |
| `apps/web/app/(portals)/chat/page.tsx` | Modified | Removed background components |
| `apps/web/app/(portals)/chat/[conversationId]/page.tsx` | Modified | Removed background components |

## Next Steps

1. **Start all three services** (API, Web, Agent)
2. **Test the approval flow** with a message that requires approval
3. **Verify the approval card displays correctly**
4. **If still having issues**, check:
   - Browser console for errors
   - Network tab for failed requests
   - Agent logs for the `approval_required` event
   - Step data structure in React DevTools

## Still Not Working?

If the approval card still doesn't show:

1. Check browser console for the SSE event:
   ```
   📥 SSE Event: approval_required {step_number: 4, ...}
   ```

2. Check the steps state in React DevTools:
   ```javascript
   steps[3].status // Should be "awaiting_approval"
   steps[3].requires_human_approval // Should be true
   ```

3. Verify the WorkflowTimeline component is receiving the correct props:
   ```javascript
   console.log(workflow.steps.find(s => s.status === 'awaiting_approval'))
   ```

4. Check that all imports are correct in `use-chat-workflow.ts`
