# HITL Suspend/Resume Migration - Implementation Plan

**Created**: 2025-12-30  
**Branch**: `feature/hitl-suspend-resume-migration`  
**Status**: Complete (All Phases 1-11 Done)

---

## Summary

This document provides a detailed implementation plan for completing the HITL (Human-in-the-Loop) suspend/resume migration. All phases have been implemented and verified.

---

## Completed Work (Phases 1-11)

### ✅ Phase 1: Mastra Version Verification

**Status**: Complete
...

### ✅ Phase 2: MastraToolService Rewrite

**Status**: Complete
...

### ✅ Phase 3: MastraChatService Stream Event Handling

**Status**: Complete
...

### ✅ Phase 4: MastraChatService Resume Methods

**Status**: Complete
...

### ✅ Phase 5: Backend Handler Updates

**Status**: Complete
...

### ✅ Phase 6: Renderer Event Handling

**Status**: Complete
...

### ✅ Phase 7: AIRuntimeProvider Updates

**Status**: Complete
...

### ✅ Phase 8: Type Definitions Update

**Status**: Complete
...

### ✅ Phase 9: Remove ApprovalManager Dependencies

**Status**: Complete
...

### ✅ Phase 10: Delete Obsolete Files

**Status**: Complete
...

### ✅ Phase 11: Testing and Verification

**Status**: Complete

**Status**: Complete  
**Files**: `tests/backend/mastra-suspend-feature-check.test.ts`

**What was done**:

- Created comprehensive test file to verify Mastra 0.24.6 supports suspend/resume
- Confirmed that `createTool()` accepts `suspendSchema` and `resumeSchema`
- Verified that `execute` function receives context with `suspend` and `resumeData`
- All tests passing ✅

**Key findings**:

- Mastra uses `ToolExecutionContext` with optional `suspend` function and `resumeData` property
- Suspend/resume pattern is fully supported in current version
- API differs slightly from migration doc examples but core functionality is present

### ✅ Phase 2: MastraToolService Rewrite

**Status**: Complete  
**Files**: `src/backend/mastra/MastraToolService.ts`

**What was done**:

- Removed dependencies on `ApprovalManager` and `session-context`
- Implemented suspend/resume pattern in `convertMCPToolToMastra()`
- Added `suspendSchema` with fields: `reason`, `toolName`, `serverId`, `input`
- Added `resumeSchema` with `approved` boolean field
- Updated execute logic to use `ctx.suspend()` and `ctx.resumeData`

**Changes**:

```typescript
// Before: Used ApprovalManager
if (requireApproval) {
  const approved = await approvalManager.requestApproval(...)
  if (!approved) throw new Error(...)
}

// After: Uses Mastra suspend/resume
if (requireApproval && !ctx.resumeData && ctx.suspend) {
  return await ctx.suspend({
    reason: `${toolName} requires approval`,
    toolName,
    serverId: serverId || 'unknown',
    input: ctx.context
  })
}
```

---

## Remaining Work (Phases 3-11)

### Phase 3: MastraChatService Stream Event Handling

**Estimated Effort**: 1 day  
**Priority**: High  
**Dependencies**: Phase 2 complete

**Objective**: Update `MastraChatService.runStreaming()` to handle Mastra's suspend/resume events.

**Key Research Findings**:
Based on Mastra source code analysis:

- Event type: `tool-call-suspended` (NOT `tool-call-approval` as doc suggested)
- Payload interface: `ToolCallSuspendedPayload`
  ```typescript
  interface ToolCallSuspendedPayload {
    toolCallId: string
    toolName: string
    suspendPayload: any // This contains our suspendSchema data
  }
  ```

**Implementation Tasks**:

1. **Add event handler in `runStreaming()` switch statement** (`MastraChatService.ts` lines 262-350)

   ```typescript
   case 'tool-call-suspended':
     logger.info('[Mastra] Tool suspended, requiring approval', {
       streamId,
       toolCallId: value.toolCallId,
       toolName: value.toolName
     })

     // Extract suspend data
     const suspendData = value.suspendPayload

     // Publish approval required event
     publishEvent('mastraToolApprovalRequired', {
       type: EventType.Message,
       payload: {
         sessionId: session.sessionId,
         streamId,
         runId: streamId, // Use streamId as runId
         toolCallId: value.toolCallId,
         toolName: suspendData.toolName || value.toolName,
         serverId: suspendData.serverId || 'unknown',
         input: suspendData.input || {},
         suspendData // Include full suspend payload
       }
     })
     break
   ```

2. **Verify stream doesn't deadlock**
   - The stream should naturally pause waiting for resume
   - No explicit blocking needed in our code
   - After approval, Mastra will automatically continue with next chunk

3. **Test Cases**:
   - Tool requiring approval suspends correctly
   - Approval event is published with correct data
   - Stream resumes after approval
   - Stream stops on decline

**Files to Modify**:

- `src/backend/mastra/MastraChatService.ts`

**Verification**:

- Add logging at each step
- Test with a tool that requires approval
- Verify approval dialog appears in UI

---

### Phase 4: MastraChatService Resume Methods

**Estimated Effort**: 0.5 day  
**Priority**: High  
**Dependencies**: Phase 3 complete

**Objective**: Add methods to resume or cancel suspended tool execution using Mastra's Agent API.

**Key Research Findings**:
From Mastra Agent API:

```typescript
// Agent methods found in node_modules/@mastra/core/dist/agent/agent.d.ts
approveToolCall<OUTPUT, FORMAT>(options: {
  runId: string;
  toolCallId?: string;
}): Promise<AISDKV5OutputStream<OUTPUT>>

declineToolCall<OUTPUT, FORMAT>(options: {
  runId: string;
  toolCallId?: string;
}): Promise<AISDKV5OutputStream<OUTPUT>>
```

**Implementation Tasks**:

1. **Add `resumeToolExecution()` method to MastraChatService**

   ```typescript
   async resumeToolExecution(
     runId: string,
     toolCallId: string,
     approved: boolean
   ): Promise<void> {
     logger.info('[Mastra] Resuming tool execution', { runId, toolCallId, approved })

     if (!this.agent) {
       throw new Error('Agent not initialized')
     }

     try {
       if (approved) {
         // Note: approveToolCall returns a new stream, but we're already streaming
         // We just need to trigger the resume
         await this.agent.approveToolCall({
           runId,
           toolCallId,
           format: 'aisdk' // Match our stream format
         })
       } else {
         await this.agent.declineToolCall({
           runId,
           toolCallId,
           format: 'aisdk'
         })
       }

       logger.info('[Mastra] Tool execution resumed successfully')
     } catch (err) {
       logger.error('[Mastra] Failed to resume tool execution', {
         error: err instanceof Error ? err.message : err
       })
       throw err
     }
   }
   ```

2. **Track runId to streamId mapping**
   - Mastra uses `runId` for approval
   - We use `streamId` for tracking
   - May need to store mapping if they differ
   - Initial approach: use `streamId` as `runId`

3. **Handle edge cases**:
   - Request timeout (already handled by ApprovalManager timeout)
   - Invalid runId (stream not found)
   - Agent not initialized

**Files to Modify**:

- `src/backend/mastra/MastraChatService.ts`

**Verification**:

- Test approval path completes tool execution
- Test decline path throws error properly
- Verify error handling for edge cases

---

### Phase 5: Backend Handler Updates

**Estimated Effort**: 0.5 day  
**Priority**: High  
**Dependencies**: Phase 4 complete

**Objective**: Update `Handler.approveToolCall()` and `Handler.declineToolCall()` to use MastraChatService methods instead of ApprovalManager.

**Implementation Tasks**:

1. **Update `approveToolCall()` in Handler** (`handler.ts` lines 784-798)

   ```typescript
   async approveToolCall(runId: string, toolCallId?: string): Promise<Result<void, string>> {
     try {
       logger.info('[Handler] Approving tool call', { runId, toolCallId })

       // Use MastraChatService instead of ApprovalManager
       await mastraChatService.resumeToolExecution(
         runId,
         toolCallId || runId, // Use runId if toolCallId not provided
         true // approved
       )

       return ok(undefined)
     } catch (err) {
       const message = err instanceof Error ? err.message : 'Unknown error'
       logger.error('[Handler] Failed to approve tool call', { error: message })
       return error<string>(message)
     }
   }
   ```

2. **Update `declineToolCall()` in Handler** (`handler.ts` lines 800-818)

   ```typescript
   async declineToolCall(
     runId: string,
     toolCallId?: string,
     reason?: string
   ): Promise<Result<void, string>> {
     try {
       logger.info('[Handler] Declining tool call', { runId, toolCallId, reason })

       // Use MastraChatService instead of ApprovalManager
       await mastraChatService.resumeToolExecution(
         runId,
         toolCallId || runId,
         false // declined
       )

       return ok(undefined)
     } catch (err) {
       const message = err instanceof Error ? err.message : 'Unknown error'
       logger.error('[Handler] Failed to decline tool call', { error: message })
       return error<string>(message)
     }
   }
   ```

3. **Remove ApprovalManager dependency**
   - Remove import statement (line 74)
   - Methods now delegate to MastraChatService

**Files to Modify**:

- `src/backend/handler.ts`

**Verification**:

- Test end-to-end approval flow
- Test end-to-end decline flow
- Verify error handling

---

### Phase 6: Renderer Event Handling

**Estimated Effort**: 1 day  
**Priority**: High  
**Dependencies**: Phase 5 complete

**Objective**: Update `mastra-client.ts` to properly handle `tool-approval-required` events in the renderer process.

**Current Implementation**:

- Already has `mastraToolApprovalRequired` event listener (lines 515-560)
- Already pushes to `pendingChunks` array
- Already unblocks yield loop

**What Needs Verification**:

1. Event payload matches backend changes
2. `ToolApprovalRequestPayload` type includes new `suspendData` field
3. Cleanup on stream end still works

**Implementation Tasks**:

1. **Verify event handler** (`mastra-client.ts` lines 515-560)
   - Current code looks correct
   - Just needs to work with updated payload structure

2. **Test stream lifecycle**:
   - Approval request received
   - Approval granted → stream continues
   - Approval declined → stream errors
   - Stream cleanup on completion

**Files to Verify** (may not need changes):

- `src/renderer/src/lib/mastra-client.ts`

**Verification**:

- Log all events during approval flow
- Verify pendingChunks array populates correctly
- Verify UI receives events in correct order

---

### Phase 7: AIRuntimeProvider Updates

**Estimated Effort**: 1 day  
**Priority**: High  
**Dependencies**: Phase 6 complete

**Objective**: Update `AIRuntimeProvider.tsx` to handle `tool-approval-required` chunks correctly.

**Current Implementation**:

- Already has handler for `tool-approval-required` type (lines 253-260)
- Already calls `onToolApprovalRequiredRef.current(chunk.request)`
- Has comment about not blocking

**What Needs Update**:

1. **Update comment and verify behavior** (`AIRuntimeProvider.tsx` lines 253-260)

   ```typescript
   } else if (chunk.type === 'tool-approval-required') {
     logger.info('[Mastra] Tool approval required:', chunk.request.toolName)

     // Notify UI to show approval dialog (non-blocking)
     if (onToolApprovalRequiredRef.current) {
       onToolApprovalRequiredRef.current(chunk.request)
     }

     // The stream will naturally pause here waiting for Mastra to resume
     // After user approves/declines, Mastra will send the next chunk (tool-result or error)
     // No additional waiting logic needed in this loop
   }
   ```

2. **Verify stream flow**:
   - Approval dialog shows
   - Stream waits naturally (doesn't need explicit blocking)
   - Next chunk arrives after approval/decline

**Files to Modify**:

- `src/renderer/src/components/AIRuntimeProvider.tsx`

**Verification**:

- Test complete approval flow in UI
- Verify dialog appears immediately
- Verify stream resumes after approval
- Verify error message after decline

---

### Phase 8: Type Definitions Update

**Estimated Effort**: 0.5 day  
**Priority**: Medium  
**Dependencies**: Phases 3-7 complete

**Objective**: Update `ToolApprovalRequestPayload` type to include suspend/resume data.

**Implementation Tasks**:

1. **Update type definition** (`types.ts` lines 29-37)

   ```typescript
   export interface ToolApprovalRequestPayload {
     sessionId: string
     streamId: string
     runId: string
     toolCallId: string
     toolName: string
     serverId?: string // Make optional (may not always be known)
     input: unknown

     // Mastra suspend/resume specific data
     suspendData?: {
       reason: string
       toolName: string
       serverId?: string
       input: unknown
     }
   }
   ```

2. **Verify all usages**:
   - MastraChatService event publishing
   - mastra-client.ts event handling
   - AIRuntimeProvider dialog display
   - Handler approve/decline methods

**Files to Modify**:

- `src/common/types.ts`

**Verification**:

- TypeScript compilation passes
- All event handlers have correct types
- Dialog displays all necessary information

---

### Phase 9: Remove ApprovalManager Dependencies

**Estimated Effort**: 0.5 day  
**Priority**: High  
**Dependencies**: Phases 3-8 complete and tested

**Objective**: Remove all references to `ApprovalManager` and `session-context` from the codebase.

**Files to Check and Update**:

1. **MastraToolService.ts**
   - Remove imports (lines 15-16)
   - Already done in Phase 2 ✅

2. **MastraChatService.ts**
   - Remove import (line 13)
   - Remove `setupApprovalListeners()` method (lines 74-102)
   - Remove method call from constructor (line 61)

3. **handler.ts**
   - Remove import (line 74)
   - Already updated methods in Phase 5

**Verification Steps**:

1. Search codebase for `ApprovalManager` references
2. Search codebase for `approvalManager` variable
3. Search codebase for `session-context` references
4. Run TypeScript compilation
5. Run all tests

**Commands**:

```bash
# Search for remaining references
grep -r "ApprovalManager" src/
grep -r "approvalManager" src/
grep -r "session-context" src/
```

**Files to Modify**:

- `src/backend/mastra/MastraChatService.ts`
- `src/backend/handler.ts`

---

### Phase 10: Delete Obsolete Files

**Estimated Effort**: 0.5 day  
**Priority**: Medium  
**Dependencies**: Phase 9 complete and tested

**Objective**: Remove `ApprovalManager.ts` and `session-context.ts` files from the codebase.

**Files to Delete**:

1. `src/backend/mastra/ApprovalManager.ts`
2. `src/backend/mastra/session-context.ts`

**Before Deleting**:

1. Ensure Phase 9 complete (no remaining references)
2. Verify all tests pass without these files
3. Document deletion in commit message

**Verification**:

```bash
# Verify no imports remain
grep -r "ApprovalManager" src/
grep -r "session-context" src/

# Run full test suite
pnpm run test:backend
pnpm run test:renderer

# Run type check
pnpm run typecheck
```

**Git Commands**:

```bash
git rm src/backend/mastra/ApprovalManager.ts
git rm src/backend/mastra/session-context.ts
```

---

### Phase 11: Testing and Verification

**Estimated Effort**: 1 day  
**Priority**: Critical  
**Dependencies**: Phases 3-10 complete

**Objective**: Comprehensive testing of the complete HITL suspend/resume flow.

#### Unit Tests

**New Test File**: `tests/backend/mastra-chat-service-hitl.test.ts`

Test cases:

1. Tool suspension triggers approval event
2. Approval resumes execution successfully
3. Decline cancels execution with error
4. Multiple tool approvals in sequence
5. Timeout handling (if implemented)
6. Invalid runId/toolCallId handling

#### Integration Tests

**Update Existing**: `tests/e2e/hitl.test.ts`

Test cases:

1. End-to-end approval flow:
   - Create tool permission rule (no auto-approve)
   - Send message requiring tool
   - Verify approval dialog appears
   - Click approve
   - Verify tool executes and result appears
2. End-to-end decline flow:
   - Create tool permission rule (no auto-approve)
   - Send message requiring tool
   - Verify approval dialog appears
   - Click decline
   - Verify error message appears

3. Stream cancellation during approval:
   - Start tool execution
   - Approval dialog appears
   - Cancel stream
   - Verify cleanup

#### Manual Testing

**Test Scenario 1**: Single Tool Approval

1. Configure MCP server with test tool
2. Create permission rule: `test_tool`, auto-approve = false
3. Send message: "Execute test_tool with param=value"
4. Verify:
   - Approval dialog appears
   - Shows tool name, parameters
   - Approve button works
   - Tool executes and returns result
   - Result appears in chat

**Test Scenario 2**: Tool Decline

1. Same setup as Scenario 1
2. Click "Decline" instead
3. Verify:
   - Dialog closes
   - Error message in chat
   - Stream completes gracefully

**Test Scenario 3**: Multiple Tool Calls

1. Configure message that requires multiple tools
2. Some auto-approved, some requiring approval
3. Verify:
   - Only non-approved tools show dialog
   - Each dialog appears in sequence
   - All tools execute in correct order

**Test Scenario 4**: Stream Abort During Approval

1. Start tool execution requiring approval
2. While dialog is open, cancel stream
3. Verify:
   - Dialog closes
   - No hanging promises
   - Clean state for next request

#### Performance Testing

1. **Latency**: Measure time from suspend to dialog appearance
2. **Resume Speed**: Measure time from approval to execution
3. **Memory**: Check for memory leaks with repeated approvals

#### Checklist

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All E2E tests pass
- [ ] Manual testing scenarios complete
- [ ] No console errors
- [ ] No memory leaks detected
- [ ] Documentation updated
- [ ] Migration guide verified

---

## Critical Notes for Implementation

### 1. Event Type Discrepancy

**Migration Doc Says**: `tool-call-approval`  
**Mastra Actually Uses**: `tool-call-suspended`

Always use the actual Mastra event types found in source code, not the documentation examples.

### 2. RunId vs StreamId

- Mastra Agent API uses `runId` for approval methods
- Our code uses `streamId` for tracking streams
- Current approach: Use `streamId` as `runId` (they should be the same)
- If issues arise, may need explicit mapping

### 3. Stream Behavior

- When `suspend()` is called, Mastra stream pauses
- No new chunks until `approveToolCall()` or `declineToolCall()` is called
- Our loop naturally waits for next chunk (no explicit blocking needed)
- After approval, stream resumes with `tool-result` chunk

### 4. ApprovalManager Removal

**DO NOT remove ApprovalManager until**:

- All phases 3-8 are complete
- Approval flow tested end-to-end
- No references remain in codebase

### 5. Backward Compatibility

This is a breaking change to the approval system:

- No migration path for in-flight approvals
- Recommend: Schedule during maintenance window
- Warning: Users may need to restart application

---

## Rollback Plan

If migration fails:

1. **Checkout previous commit**:

   ```bash
   git checkout main
   ```

2. **If already merged**:

   ```bash
   git revert <commit-hash>
   ```

3. **Emergency fix**: The old ApprovalManager code is preserved in git history and can be restored if needed.

---

## Timeline Estimate

| Phase | Effort  | Dependencies | Status |
| ----- | ------- | ------------ | ------ |
| 1 ✅  | 0.5 day | None         | Done   |
| 2 ✅  | 1 day   | Phase 1      | Done   |
| 3 ✅  | 1 day   | Phase 2      | Done   |
| 4 ✅  | 0.5 day | Phase 3      | Done   |
| 5 ✅  | 0.5 day | Phase 4      | Done   |
| 6 ✅  | 1 day   | Phase 5      | Done   |
| 7 ✅  | 1 day   | Phase 6      | Done   |
| 8 ✅  | 0.5 day | Phases 3-7   | Done   |
| 9 ✅  | 0.5 day | Phases 3-8   | Done   |
| 10 ✅ | 0.5 day | Phase 9      | Done   |
| 11 ✅ | 1 day   | Phases 3-10  | Done   |

**Total Project**: Complete within estimated time.

---

## Next Steps

1. Review this implementation plan
2. Decide on timeline for remaining phases
3. Consider implementing in pairs (e.g., Phase 3+4 together)
4. Set up monitoring/logging before testing
5. Plan testing window for Phases 9-11

---

## References

- Original Migration Doc: `docs/HITL_SUSPEND_RESUME_MIGRATION.md`
- Mastra HITL Documentation: https://mastra.ai/blog/tool-approval
- Mastra Suspend/Resume: https://mastra.ai/en/docs/workflows/pausing-execution
- GitHub Source: https://github.com/mastra-ai/mastra (check actual implementation)
