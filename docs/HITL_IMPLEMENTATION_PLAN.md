# HITL Suspend/Resume Migration - Implementation Plan

**Created**: 2025-12-30  
**Branch**: `feature/hitl-suspend-resume-migration`  
**Status**: Complete (All Phases 1-11 Done)

---

## Summary

This document provides a detailed implementation plan for completing the HITL (Human-in-the-Loop) suspend/resume migration. All phases have been implemented and verified.

**Final Implementation Pattern**:
We adopted Mastra's native **Stream-Level Approval** pattern instead of manual tool-level suspension. This requires:

1. `Mastra` instance with `InMemoryStore` (or persistent storage)
2. `requireToolApproval: true` in `agent.stream()` options
3. Handling `tool-call-approval` events (not `tool-call-suspended`)
4. Using `agent.approveToolCall()` which returns a continuation stream

---

## Completed Work (Phases 1-11)

### ✅ Phase 1: Mastra Version Verification

**Status**: Complete

### ✅ Phase 2: MastraToolService Rewrite

**Status**: Complete  
**Key Changes**:

- Removed manual `ctx.suspend()` logic (reverted to standard execute)
- Removed `suspendSchema` and `resumeSchema`
- Tool approval is now handled entirely by Mastra's core agent loop

### ✅ Phase 3: MastraChatService Stream Event Handling

**Status**: Complete  
**Key Changes**:

- Added `Mastra` instance with `InMemoryStore` initialization
- Updated `streamText` to use `requireToolApproval: true`
- Changed event handler from `tool-call-suspended` to `tool-call-approval`
- Implemented stream record tracking with `suspended` state

### ✅ Phase 4: MastraChatService Resume Methods

**Status**: Complete  
**Key Changes**:

- Implemented `resumeToolExecution` to call `agent.approveToolCall()`
- Added logic to read and process the **continuation stream** returned by approval
- Added stream cleanup logic

### ✅ Phase 5: Backend Handler Updates

**Status**: Complete  
**Files**: `src/backend/handler.ts`

### ✅ Phase 6: Renderer Event Handling

**Status**: Complete  
**Files**: `src/renderer/src/lib/mastra-client.ts`

### ✅ Phase 7: AIRuntimeProvider Updates

**Status**: Complete  
**Files**: `src/renderer/src/components/AIRuntimeProvider.tsx`

### ✅ Phase 8: Type Definitions Update

**Status**: Complete  
**Files**: `src/common/types.ts`

### ✅ Phase 9: Remove ApprovalManager Dependencies

**Status**: Complete

### ✅ Phase 10: Delete Obsolete Files

**Status**: Complete

### ✅ Phase 11: Testing and Verification

**Status**: Complete

- Verified end-to-end flow with "fetch https://example.com"
- Confirmed approval dialog appears
- Confirmed resume works and returns results
- Confirmed no "snapshot not found" errors

---

## Reference: Correct Resume Pattern

```typescript
// Resume execution and handle the continuation stream
const continuationStream = approved
  ? await this.agent.approveToolCall({ runId, toolCallId, format: 'aisdk' })
  : await this.agent.declineToolCall({ runId, toolCallId, format: 'aisdk' })

// Read chunks from the continuation stream
const reader = continuationStream.fullStream.getReader()
while (true) {
  const { value, done } = await reader.read()
  if (done) break
  // Process chunks (text-delta, tool-result, etc.)
}
```
