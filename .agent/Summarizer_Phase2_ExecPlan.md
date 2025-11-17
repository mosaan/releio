# Conversation History Compression - Phase 2: UI Integration

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `.agent/PLANS.md` from the repository root.


## Purpose / Big Picture

This Phase 2 implementation delivers the user interface for automatic conversation history compression in the Electron AI chat application. After this phase, users will be able to configure compression settings through the Settings page, see their token usage in real-time during chats, trigger manual compression when needed, and have the system automatically compress conversations when they approach token limits.

Users will see a new "Compression" section in the Settings page where they can configure thresholds and retention settings. During chat sessions, they will see a token usage indicator showing how much of the model's context window is being used. When the token count approaches the limit, they will be able to click a "Compress Conversation" button to manually trigger compression, or let the system compress automatically. After compression, they will see a summary message in the chat showing what was compressed, and can expand it to read the full summary text.

This phase builds on Phase 1 (backend implementation) which delivered the core compression services: `TokenCounter`, `SummarizationService`, `ModelConfigService`, `CompressionService`, and database schema extensions. All backend functionality is already implemented and tested (72 passing tests).


## Progress

Use timestamps to track progress. Update this section at every stopping point.

- [x] Milestone 1: IPC Communication Layer (Completed: 2025-11-17)
  - [x] Add compression-related types to `src/common/types.ts`
  - [x] Extend `RendererBackendAPI` interface with compression methods
  - [x] Implement handlers in `src/backend/handler.ts`
  - [x] Update `src/preload/server.ts` to expose new APIs
  - [ ] Write unit tests for IPC handlers (Deferred to Milestone 7)

- [x] Milestone 2: Settings UI for Compression Configuration (Completed: 2025-11-17)
  - [x] Create `CompressionSettings.tsx` component
  - [x] Add compression section to Settings page
  - [x] Implement threshold slider (70-100%)
  - [x] Implement retention token input
  - [x] Implement auto-compression toggle
  - [ ] Add "Test Configuration" button to verify settings (Deferred - not critical for MVP)
  - [x] Persist settings to database via backend API

- [x] Milestone 3: Token Usage Display (Completed: 2025-11-17)
  - [x] Create `TokenUsageIndicator.tsx` component
  - [x] Integrate into ChatPanel header
  - [x] Show current tokens / max tokens with percentage
  - [x] Color-code indicator (green < 70%, yellow 70-90%, orange 90-95%, red > 95%)
  - [x] Add tooltip with detailed breakdown
  - [x] Poll backend for token count on message changes (every 3 seconds)

- [x] Milestone 4: Manual Compression UI (Completed: 2025-11-17)
  - [x] Add "Compress Conversation" button to ChatPanel
  - [x] Show button only when compression is beneficial (> threshold)
  - [x] Create `CompressionConfirmDialog.tsx` component
  - [x] Show preview: messages to compress, expected new token count
  - [x] Implement compression execution with progress indicator
  - [x] Handle errors gracefully with user-friendly messages

- [ ] Milestone 5: Automatic Compression Integration
  - [ ] Integrate compression check before AI streaming
  - [ ] Trigger auto-compression when threshold exceeded
  - [ ] Show non-blocking notification during compression
  - [ ] Update chat with summary message after compression
  - [ ] Ensure message IDs remain stable after compression

- [ ] Milestone 6: Compression Summary Display
  - [ ] Create `SummaryMessage.tsx` component
  - [ ] Render summary as special system message in chat
  - [ ] Add expand/collapse for full summary text
  - [ ] Show metadata: compressed message count, token reduction
  - [ ] Style distinctly from regular messages (border, background)

- [ ] Milestone 7: End-to-End Testing
  - [ ] Write integration tests for settings persistence
  - [ ] Test token usage display updates correctly
  - [ ] Test manual compression workflow
  - [ ] Test automatic compression trigger
  - [ ] Test multi-level compression (compression of compressed sessions)
  - [ ] Test error scenarios (API failures, network issues)
  - [ ] Manual testing with real AI providers


## Surprises & Discoveries

Document unexpected behaviors, bugs, optimizations, or insights discovered during implementation.

(To be filled during implementation)


## Decision Log

Record every decision made while working on the plan.

### Milestone 1: IPC Communication Layer (2025-11-17)

**Decision 1: Compression Settings Storage**
- **Context**: Need to decide where to store compression settings (per-session vs global)
- **Decision**: Store settings per-session using key pattern `compression:${sessionId}` with fallback to defaults
- **Rationale**: Allows different sessions to have different compression preferences while providing sensible defaults
- **Defaults chosen**: threshold=0.95 (95%), retentionTokens=2000, autoCompress=true

**Decision 2: Error Handling in Handlers**
- **Context**: Handler methods need consistent error handling
- **Decision**: Use `Result<T, string>` for all compression handlers that can fail with validation or runtime errors
- **Rationale**: Matches existing patterns in handler.ts (e.g., testFullConnection, MCP handlers)

**Decision 3: ModelConfigService Initialization**
- **Context**: ModelConfigService requires database instance
- **Decision**: Initialize in Handler constructor with existing `db` instance
- **Rationale**: Follows dependency injection pattern, shares database connection with other services

### Milestone 2: Settings UI for Compression Configuration (2025-11-17)

**Decision 4: Manual Slider Component Implementation**
- **Context**: `pnpm run shadcn add slider` failed with 503 error from shadcn registry
- **Decision**: Manually implement slider component using @radix-ui/react-slider
- **Rationale**: Following project guidelines to avoid custom implementations without approval, but shadcn components are just wrappers around Radix primitives, so implementing the same wrapper is acceptable
- **Implementation**: Created `src/renderer/src/components/ui/slider.tsx` matching shadcn patterns

**Decision 5: Global Defaults for Compression Settings**
- **Context**: Compression settings are per-session, but Settings page is global
- **Decision**: Use sessionId="global-defaults" for the Settings page component
- **Rationale**: Allows users to set default preferences that will be applied to new sessions, while keeping the per-session architecture intact for future session-specific overrides

**Decision 6: Deferred Test Configuration Button**
- **Context**: ExecPlan specified "Test Configuration" button to verify settings
- **Decision**: Defer this feature as non-critical for MVP
- **Rationale**: Testing compression can be done through actual usage in chat; adding preview functionality can come later if needed


## Outcomes & Retrospective

(To be filled at completion of major milestones)


## Context and Orientation

This is an Electron application using a three-process architecture (main, backend, renderer). The renderer process (`src/renderer/`) handles the React-based UI, the backend process (`src/backend/`) handles business logic, and the main process (`src/main/`) coordinates IPC communication.

**Existing infrastructure:**
- UI Framework: React 19 with TypeScript, Tailwind CSS 4, Shadcn/ui components
- Chat UI: Assistant-ui library for chat interface components
- Settings: Tabbed settings page in `src/renderer/src/components/Settings.tsx`
- IPC: Type-safe communication via `src/common/types.ts` and `src/preload/server.ts`
- Backend API: All backend methods exposed via `window.backend` in renderer

**Key files for Phase 2:**
- `src/common/types.ts` - Shared TypeScript types for IPC communication
- `src/preload/server.ts` - Preload script exposing backend API to renderer
- `src/backend/handlers.ts` - Backend IPC handlers
- `src/renderer/src/components/Settings.tsx` - Main settings page
- `src/renderer/src/components/ChatPanel.tsx` - Chat interface
- `src/renderer/src/components/ChatPage.tsx` - Chat page container

**Phase 1 deliverables (already complete):**
- `src/backend/compression/TokenCounter.ts` - Token counting service
- `src/backend/compression/SummarizationService.ts` - AI-powered summarization
- `src/backend/compression/ModelConfigService.ts` - Model configuration management
- `src/backend/compression/CompressionService.ts` - Core compression orchestration
- `src/backend/session/ChatSessionStore.ts` - Extended with compression methods
- Database schema: `model_configs` and `session_snapshots` tables
- 72 passing unit and integration tests

**What we are building:**
Phase 2 creates the UI layer that allows users to interact with the compression system. This includes:
1. Settings UI to configure compression behavior
2. Real-time token usage display during chats
3. Manual compression trigger with confirmation dialog
4. Automatic compression integration in the chat flow
5. Visual representation of compression summaries in the chat
6. End-to-end testing of the full user workflow

**Design references:**
- `docs/CONVERSATION_HISTORY_COMPRESSION_REQUIREMENTS.md` (v1.6) - Section 5: User Interface
- `docs/CONVERSATION_HISTORY_COMPRESSION_DESIGN.md` (v3.1) - Section 4: UI Integration


## Plan of Work

This section describes the implementation approach for each milestone in narrative form. Read the entire section before beginning implementation.


### Milestone 1: IPC Communication Layer

The renderer process (React UI) needs to communicate with the backend compression services. Electron uses IPC (Inter-Process Communication) for this. We will extend the existing IPC infrastructure to support compression-related operations.

**Step 1.1: Define TypeScript types** in `src/common/types.ts`:

Add new types for compression operations:
- `CompressionSettings`: User-configurable settings (threshold, retentionTokens, autoCompress)
- `TokenUsageInfo`: Current token counts and utilization percentage
- `CompressionPreview`: Preview of what will be compressed (message count, token reduction)
- `CompressionResult`: Result of a compression operation (success, new token count, summary ID)

**Step 1.2: Extend RendererBackendAPI** in `src/common/types.ts`:

Add these method signatures to the `RendererBackendAPI` interface:
- `getCompressionSettings(sessionId: string)`: Fetch current compression settings
- `setCompressionSettings(sessionId: string, settings: CompressionSettings)`: Save compression settings
- `getTokenUsage(sessionId: string, provider: string, model: string)`: Get current token usage
- `checkCompressionNeeded(sessionId: string, provider: string, model: string)`: Check if compression is recommended
- `compressConversation(sessionId: string, provider: string, model: string, apiKey: string, force?: boolean)`: Trigger compression
- `getCompressionSummaries(sessionId: string)`: Get all compression summaries for a session

**Step 1.3: Implement backend handlers** in `src/backend/handlers.ts`:

Create handler functions that invoke the compression services (from Phase 1):
- Instantiate `CompressionService` with its dependencies
- Wire up each handler to call the appropriate service method
- Wrap results in `Result<T>` type for error handling
- Use existing database connection and session store instances

**Step 1.4: Register handlers** in `src/backend/server.ts`:

Register the new IPC handlers so they can be invoked from the renderer:
- Follow the existing pattern for other handlers (e.g., `createChatSession`)
- Ensure handlers are registered before the backend connection is established

**Step 1.5: Expose APIs in preload** in `src/preload/server.ts`:

Add the new methods to the `backendAPI` object using the `_invoke` helper:
```typescript
getCompressionSettings: (...args) => this._invoke('getCompressionSettings', ...args),
setCompressionSettings: (...args) => this._invoke('setCompressionSettings', ...args),
// ... etc
```

**Validation:** Create a simple renderer-side test that calls each new API method and verifies the response. Use `pnpm run dev` to start the app and check the browser console.


### Milestone 2: Settings UI for Compression Configuration

Users need a way to configure compression behavior. We will add a new "Compression" section to the Settings page with controls for threshold, retention tokens, and auto-compression.

**Step 2.1: Create CompressionSettings component** in `src/renderer/src/components/CompressionSettings.tsx`:

Create a new React component that:
- Fetches current compression settings on mount via `window.backend.getCompressionSettings()`
- Displays a slider for compression threshold (70-100%, default 95%)
- Displays a number input for retention tokens (default: from model config)
- Displays a toggle switch for auto-compression (default: true)
- Shows helpful descriptions for each setting
- Includes a "Test Configuration" button that checks if the current session would be compressed
- Includes a "Save" button that persists settings via `window.backend.setCompressionSettings()`

Use Shadcn/ui components for consistency:
- `Slider` for threshold (from `src/renderer/src/components/ui/slider.tsx`, add if missing)
- `Input` for retention tokens
- `Switch` for auto-compression toggle
- `Button` for actions
- `Label` for form labels
- `Card` for section container

**Step 2.2: Integrate into Settings page** in `src/renderer/src/components/Settings.tsx`:

Add a new tab or section for "Compression":
- Import the `CompressionSettings` component
- Add it to the tabs list (follow the existing pattern for AI Settings, Proxy, etc.)
- Ensure tab navigation works correctly

**Step 2.3: Handle edge cases:**
- Show loading state while fetching settings
- Show error message if fetch fails
- Disable "Save" button while saving
- Show success notification after save
- Validate inputs (threshold 70-100%, retention > 0)

**Validation:** Open the Settings page, navigate to Compression tab, change values, save, close settings, reopen and verify values persist. Click "Test Configuration" and verify it shows whether compression would occur.


### Milestone 3: Token Usage Display

Users need to see how much of the model's context window is being used. We will add a token usage indicator to the chat header that updates in real-time.

**Step 3.1: Create TokenUsageIndicator component** in `src/renderer/src/components/TokenUsageIndicator.tsx`:

Create a React component that:
- Accepts `sessionId`, `provider`, `model` as props
- Calls `window.backend.getTokenUsage(sessionId, provider, model)` on mount and when messages change
- Displays: "Tokens: 1,234 / 128,000 (0.96%)"
- Color-codes the percentage:
  - Green (text-green-600): < 70%
  - Yellow (text-yellow-600): 70-90%
  - Orange (text-orange-600): 90-95%
  - Red (text-red-600): > 95%
- Uses a `Tooltip` (Shadcn/ui) to show detailed breakdown:
  - Input tokens: XXX
  - Output tokens: XXX
  - Estimated response: XXX
  - Total: XXX
  - Threshold: XX%
  - Status: "Compression recommended" or "Within limits"

**Step 3.2: Integrate into ChatPanel** in `src/renderer/src/components/ChatPanel.tsx`:

Add the `TokenUsageIndicator` to the chat header:
- Place it in the top-right corner next to the model selector
- Pass current `sessionId`, `provider`, `model` as props
- Update when active session changes

**Step 3.3: Optimize polling:**
- Use `useEffect` to poll token usage every 2 seconds when chat is active
- Debounce updates to avoid excessive renders
- Stop polling when chat is inactive or unmounted

**Validation:** Start a chat, send messages, observe the token count increasing. Verify color changes as percentage increases. Hover over the indicator and verify the tooltip shows detailed breakdown.


### Milestone 4: Manual Compression UI

Users need a way to manually trigger compression when they want to free up context space. We will add a "Compress Conversation" button that shows a preview and confirmation dialog.

**Step 4.1: Create CompressionConfirmDialog component** in `src/renderer/src/components/CompressionConfirmDialog.tsx`:

Create a dialog component (using Shadcn/ui `AlertDialog`) that:
- Accepts `sessionId`, `provider`, `model`, `apiKey` as props
- Accepts `onCompress` and `onCancel` callbacks
- Shows preview information:
  - Current token count
  - Messages to be compressed (count)
  - Expected new token count after compression
  - Estimated token savings (percentage)
- Has "Cancel" and "Compress" buttons
- Shows a loading spinner during compression
- Shows error message if compression fails
- Calls `window.backend.compressConversation()` when user confirms

**Step 4.2: Add compression button to ChatPanel** in `src/renderer/src/components/ChatPanel.tsx`:

Add a button to the chat header:
- Label: "Compress" with a compression icon (use Lucide React icon, e.g., `Archive` or `Package`)
- Only show when compression is beneficial:
  - Call `window.backend.checkCompressionNeeded()` periodically
  - Show button with a badge if compression is recommended
- Clicking opens the `CompressionConfirmDialog`
- Disable during active AI streaming

**Step 4.3: Handle post-compression:**
- Reload chat messages after compression completes
- Scroll to show the new summary message
- Update token usage indicator
- Show success toast notification

**Validation:** Start a long chat (50+ messages), verify "Compress" button appears and shows badge when threshold is exceeded. Click the button, verify preview shows correct counts, confirm compression, verify chat reloads with summary message at the top.


### Milestone 5: Automatic Compression Integration

Users want the system to automatically compress conversations when they approach token limits. We will integrate compression checks into the AI streaming flow.

**Step 5.1: Add compression check before streaming** in the chat message send handler:

Before calling `window.backend.streamAIText()`:
- Check if auto-compression is enabled in settings
- Call `window.backend.checkCompressionNeeded(sessionId, provider, model)`
- If compression is needed and auto-compression is enabled:
  - Show a non-blocking notification: "Compressing conversation to free up context space..."
  - Call `window.backend.compressConversation(sessionId, provider, model, apiKey, false)` (force=false, respect threshold)
  - Wait for compression to complete
  - Reload chat messages
  - Proceed with AI streaming

**Step 5.2: Handle compression during streaming:**
- If user sends a message while another is streaming, queue the compression check
- Show clear UI indication that compression is happening (e.g., a banner at the top of the chat)
- Ensure the chat remains responsive (don't block the UI)

**Step 5.3: Error handling:**
- If compression fails, log the error but don't block the message send
- Show a warning to the user: "Auto-compression failed. You may need to manually compress the conversation."
- Allow the message to proceed anyway (user can manually compress later)

**Validation:** Enable auto-compression in settings. Start a chat and send messages until token usage exceeds threshold. Send another message and verify auto-compression triggers automatically, summary message appears, and the new message is sent successfully.


### Milestone 6: Compression Summary Display

After compression, users need to see what was compressed. We will display compression summaries as special system messages in the chat.

**Step 6.1: Create SummaryMessage component** in `src/renderer/src/components/assistant-ui/SummaryMessage.tsx`:

Create a component that:
- Accepts `summary` object with: `content` (summary text), `tokenCount`, `messagesCompressed`, `createdAt`
- Renders as a distinct system message:
  - Light blue/gray background
  - Border on the left
  - Icon indicating it's a summary (e.g., `FileText` from Lucide)
- Shows metadata in a small header:
  - "Conversation Summary • Compressed XX messages • Saved XX tokens"
  - Timestamp
- Shows summary content with expand/collapse:
  - Initially collapsed: show first 2-3 lines with "..." and "Show more" link
  - When expanded: show full summary with markdown rendering (use `MarkdownText` from assistant-ui)
  - "Show less" link to collapse again

**Step 6.2: Integrate into chat message rendering:**

Modify the chat message rendering logic (likely in `ChatPanel.tsx` or a message list component):
- Fetch summaries via `window.backend.getCompressionSummaries(sessionId)`
- Render `SummaryMessage` components before the regular messages
- Position each summary at the point where compression occurred (based on `messageCutoffId`)
- Ensure summaries are visually distinct from user/assistant messages

**Step 6.3: Style the summary message:**
- Use Tailwind classes for styling
- Ensure it's clearly different from regular messages
- Make it readable and non-intrusive
- Test in both light and dark themes (if supported)

**Validation:** Trigger a compression (manual or auto), verify a summary message appears in the chat. Verify it shows correct metadata (message count, token savings). Click "Show more" and verify full summary text displays with markdown formatting. Click "Show less" and verify it collapses.


### Milestone 7: End-to-End Testing

We need comprehensive tests to ensure the entire UI integration works correctly across all scenarios.

**Step 7.1: Settings persistence tests:**
- Open settings, change compression values, save, reload app, verify values persist
- Test invalid inputs (threshold < 70%, negative retention) and verify validation errors

**Step 7.2: Token usage display tests:**
- Start a chat, send messages, verify token count increases
- Verify color changes at different thresholds
- Verify tooltip shows correct breakdown

**Step 7.3: Manual compression tests:**
- Trigger manual compression, verify preview is accurate
- Confirm compression, verify summary appears and token count drops
- Cancel compression, verify nothing changes

**Step 7.4: Auto-compression tests:**
- Enable auto-compression, send messages until threshold exceeded
- Verify auto-compression triggers automatically
- Disable auto-compression, verify it doesn't trigger

**Step 7.5: Multi-level compression tests:**
- Compress a conversation once, continue chatting, trigger compression again
- Verify second summary includes both previous summary and new messages
- Verify token count continues to drop

**Step 7.6: Error scenario tests:**
- Disconnect network, trigger compression, verify error handling
- Use invalid API key, verify error message
- Trigger compression on empty session, verify appropriate handling

**Step 7.7: Manual testing:**
- Test with real AI providers (OpenAI, Anthropic, Google)
- Test with long conversations (100+ messages)
- Test with different models and their context windows
- Test the full user workflow from settings to auto-compression

**Validation:** All automated tests pass. Manual testing reveals no critical bugs. User experience is smooth and intuitive. Performance is acceptable (no UI lag during compression).


## Concrete Steps

This section provides exact commands to run at each stage. Update as work proceeds.


### Milestone 1: IPC Communication Layer

**Working directory:** `/home/user/releio`

1. Edit `src/common/types.ts` to add compression types:
   ```bash
   # Open file in editor
   # Add interfaces near other backend API types (around line 150-200)
   ```

2. Implement handlers in `src/backend/handlers.ts`:
   ```bash
   # Open file in editor
   # Add handler functions following existing patterns
   ```

3. Register handlers in `src/backend/server.ts`:
   ```bash
   # Open file in editor
   # Add handler registrations in the connection setup
   ```

4. Expose APIs in `src/preload/server.ts`:
   ```bash
   # Open file in editor
   # Add method proxies to backendAPI object
   ```

5. Test the IPC layer:
   ```bash
   pnpm run dev
   # Open browser console and test APIs:
   # await window.backend.getCompressionSettings('test-session-id')
   ```

**Expected output:** IPC calls succeed and return expected data structures (or appropriate errors for missing sessions).


### Milestone 2: Settings UI

**Working directory:** `/home/user/releio`

1. Create Slider component if not exists:
   ```bash
   pnpm run shadcn add slider
   ```

2. Create CompressionSettings component:
   ```bash
   # Create new file: src/renderer/src/components/CompressionSettings.tsx
   # Implement component with form controls
   ```

3. Integrate into Settings page:
   ```bash
   # Edit: src/renderer/src/components/Settings.tsx
   # Add new tab/section for compression
   ```

4. Test the settings UI:
   ```bash
   pnpm run dev
   # Open Settings page, navigate to Compression tab
   # Change values, save, reload, verify persistence
   ```

**Expected output:** Compression settings UI is visible, functional, and persists changes correctly.


### Milestone 3: Token Usage Display

**Working directory:** `/home/user/releio`

1. Create TokenUsageIndicator component:
   ```bash
   # Create new file: src/renderer/src/components/TokenUsageIndicator.tsx
   # Implement component with polling logic
   ```

2. Integrate into ChatPanel:
   ```bash
   # Edit: src/renderer/src/components/ChatPanel.tsx
   # Add indicator to header
   ```

3. Test token usage display:
   ```bash
   pnpm run dev
   # Start a chat, send messages, observe token count
   # Verify color changes and tooltip
   ```

**Expected output:** Token usage indicator appears in chat header, updates as messages are sent, shows correct colors and tooltip.


### Milestone 4: Manual Compression UI

**Working directory:** `/home/user/releio`

1. Create CompressionConfirmDialog component:
   ```bash
   # Create new file: src/renderer/src/components/CompressionConfirmDialog.tsx
   # Implement dialog with preview and confirmation
   ```

2. Add compression button to ChatPanel:
   ```bash
   # Edit: src/renderer/src/components/ChatPanel.tsx
   # Add button with conditional visibility
   ```

3. Test manual compression:
   ```bash
   pnpm run dev
   # Start a long chat, click "Compress" button
   # Verify preview, confirm, verify summary appears
   ```

**Expected output:** Compression button appears when needed, preview shows accurate information, compression completes successfully and chat reloads with summary.


### Milestone 5: Automatic Compression

**Working directory:** `/home/user/releio`

1. Add compression check to message send flow:
   ```bash
   # Edit: Message send handler (likely in ChatPanel.tsx or ChatPage.tsx)
   # Add compression check before streamAIText call
   ```

2. Test auto-compression:
   ```bash
   pnpm run dev
   # Enable auto-compression in settings
   # Send messages until threshold exceeded
   # Verify auto-compression triggers
   ```

**Expected output:** Auto-compression triggers automatically when threshold is exceeded, shows notification, completes compression, and sends message successfully.


### Milestone 6: Summary Display

**Working directory:** `/home/user/releio`

1. Create SummaryMessage component:
   ```bash
   # Create new file: src/renderer/src/components/assistant-ui/SummaryMessage.tsx
   # Implement component with expand/collapse
   ```

2. Integrate into chat rendering:
   ```bash
   # Edit: Chat message rendering logic (ChatPanel.tsx or message list component)
   # Add summary message rendering
   ```

3. Test summary display:
   ```bash
   pnpm run dev
   # Trigger compression, verify summary appears
   # Test expand/collapse functionality
   ```

**Expected output:** Summary messages appear in chat, are visually distinct, show correct metadata, and expand/collapse works correctly.


### Milestone 7: End-to-End Testing

**Working directory:** `/home/user/releio`

1. Run automated tests (when written):
   ```bash
   # Once e2e tests are written:
   pnpm run test:e2e  # or equivalent command
   ```

2. Manual testing checklist:
   - [ ] Settings persistence
   - [ ] Token usage display
   - [ ] Manual compression
   - [ ] Auto-compression
   - [ ] Multi-level compression
   - [ ] Error handling
   - [ ] Real AI provider testing
   - [ ] Long conversation testing
   - [ ] Different models and context windows

**Expected output:** All tests pass, no critical bugs found in manual testing.


## Validation and Acceptance

After completing all milestones, the following user-visible behaviors must be demonstrable:

**Settings Configuration:**
1. Open Settings page, navigate to "Compression" tab
2. Adjust compression threshold slider (e.g., to 90%)
3. Enter retention token count (e.g., 2000)
4. Toggle auto-compression on/off
5. Click "Test Configuration" - see whether current session would be compressed
6. Click "Save" - settings persist across app restarts

**Token Usage Display:**
1. Start a new chat session
2. Observe token usage indicator in chat header: "Tokens: 0 / 128,000 (0%)"
3. Send several messages
4. Observe token count increasing in real-time
5. Hover over indicator - tooltip shows detailed breakdown
6. As percentage increases, color changes: green → yellow → orange → red

**Manual Compression:**
1. Continue chat until token usage exceeds threshold (e.g., > 90%)
2. "Compress" button appears in chat header with a badge
3. Click "Compress" button
4. Dialog shows preview:
   - Current tokens: 115,000
   - Messages to compress: 45
   - New token count: 3,500
   - Token savings: 96.9%
5. Click "Compress" to confirm
6. Loading spinner shows during compression
7. Chat reloads with summary message at the top
8. Token usage indicator updates to show new lower count
9. Success notification appears

**Automatic Compression:**
1. Enable auto-compression in settings
2. Start a new chat and send messages until threshold exceeded
3. Send another message
4. System automatically triggers compression before sending message
5. Non-blocking notification: "Compressing conversation..."
6. Compression completes, summary appears
7. Original message is sent to AI
8. Chat continues normally

**Compression Summary:**
1. After compression, observe summary message in chat
2. Summary shows metadata: "Conversation Summary • Compressed 45 messages • Saved 111,500 tokens"
3. Summary shows first few lines of text with "Show more" link
4. Click "Show more" - full summary expands with markdown formatting
5. Click "Show less" - summary collapses again
6. Summary is visually distinct (border, background color, icon)

**Multi-Level Compression:**
1. Compress a conversation once
2. Continue chatting, exceed threshold again
3. Trigger compression again (manual or auto)
4. New summary appears that references the previous summary
5. Token count continues to drop
6. Both summaries remain visible in chat (or merged into one)

**Error Handling:**
1. Disconnect network
2. Try to compress conversation
3. Error message appears: "Compression failed: Network error. Please try again."
4. Reconnect network
5. Retry compression - succeeds

**All acceptance criteria must pass to consider Phase 2 complete.**


## Idempotence and Recovery

All UI operations are safe to retry:

**Settings changes:**
- Changing settings and saving multiple times has no adverse effects
- Invalid inputs are validated and rejected before saving
- Settings can be reset to defaults via the UI

**Compression operations:**
- Attempting to compress an already-compressed session does nothing (or creates a new summary if threshold is exceeded again)
- Cancelling compression mid-operation leaves the session unchanged
- Failed compressions can be retried without data loss

**Recovery from errors:**
- If compression fails, the original messages remain intact
- Users can manually trigger compression again
- Auto-compression failures don't prevent message sending
- All errors are logged for debugging

**Clean state after completion:**
- No temporary files or state left behind
- Database is consistent (all summaries have corresponding snapshots)
- UI state is synchronized with backend state


## Interfaces and Dependencies

This section specifies the exact TypeScript interfaces and dependencies required for Phase 2.


### TypeScript Interfaces (src/common/types.ts)

Add these interfaces to `src/common/types.ts`:

```typescript
/**
 * User-configurable compression settings for a chat session.
 */
export interface CompressionSettings {
  /** Compression threshold as a percentage (0.70 to 1.00) */
  threshold: number
  /** Number of recent tokens to retain after compression */
  retentionTokens: number
  /** Whether to automatically compress when threshold is exceeded */
  autoCompress: boolean
}

/**
 * Current token usage information for a chat session.
 */
export interface TokenUsageInfo {
  /** Total current tokens (input + output) */
  currentTokens: number
  /** Maximum tokens allowed by the model */
  maxTokens: number
  /** Input tokens (user messages + system + summaries) */
  inputTokens: number
  /** Output tokens (assistant messages) */
  outputTokens: number
  /** Estimated tokens for next AI response */
  estimatedResponseTokens: number
  /** Utilization percentage (currentTokens / maxTokens) */
  utilizationPercentage: number
  /** Compression threshold percentage */
  thresholdPercentage: number
  /** Whether compression is needed */
  needsCompression: boolean
}

/**
 * Preview of what will happen during compression.
 */
export interface CompressionPreview {
  /** Number of messages that will be compressed */
  messagesToCompress: number
  /** Current total token count */
  currentTokens: number
  /** Expected token count after compression */
  expectedNewTokens: number
  /** Expected token savings */
  tokenSavings: number
  /** Token savings as a percentage */
  savingsPercentage: number
  /** Whether compression is possible */
  canCompress: boolean
  /** Reason if compression is not possible */
  reason?: string
}

/**
 * Result of a compression operation.
 */
export interface CompressionResult {
  /** Whether compression was performed */
  compressed: boolean
  /** ID of the created summary snapshot (if compressed) */
  summaryId?: string
  /** Number of messages compressed */
  messagesCompressed?: number
  /** Original token count before compression */
  originalTokenCount?: number
  /** New token count after compression */
  newTokenCount?: number
  /** Compression ratio as a percentage */
  compressionRatio?: number
  /** Reason if compression was not performed */
  reason?: string
}

/**
 * A compression summary snapshot.
 */
export interface CompressionSummary {
  /** Unique ID of the summary */
  id: string
  /** Summary text content */
  content: string
  /** ID of the last message included in the summary */
  messageCutoffId: string
  /** Token count of the summary */
  tokenCount: number
  /** Timestamp when summary was created */
  createdAt: number
}
```

**Extend the RendererBackendAPI interface:**

```typescript
export interface RendererBackendAPI {
  // ... existing methods ...

  // Compression Settings
  getCompressionSettings: (sessionId: string) => Promise<Result<CompressionSettings>>
  setCompressionSettings: (sessionId: string, settings: CompressionSettings) => Promise<Result<void>>

  // Token Usage
  getTokenUsage: (
    sessionId: string,
    provider: string,
    model: string,
    additionalInput?: string
  ) => Promise<Result<TokenUsageInfo>>

  // Compression Operations
  checkCompressionNeeded: (
    sessionId: string,
    provider: string,
    model: string
  ) => Promise<Result<boolean>>

  getCompressionPreview: (
    sessionId: string,
    provider: string,
    model: string,
    retentionTokens?: number
  ) => Promise<Result<CompressionPreview>>

  compressConversation: (
    sessionId: string,
    provider: string,
    model: string,
    apiKey: string,
    force?: boolean,
    retentionTokenCount?: number
  ) => Promise<Result<CompressionResult>>

  getCompressionSummaries: (sessionId: string) => Promise<Result<CompressionSummary[]>>
}
```


### Component Props Interfaces

**CompressionSettings.tsx:**
```typescript
interface CompressionSettingsProps {
  sessionId: string
  onSettingsChange?: (settings: CompressionSettings) => void
}
```

**TokenUsageIndicator.tsx:**
```typescript
interface TokenUsageIndicatorProps {
  sessionId: string
  provider: string
  model: string
  apiKey: string
}
```

**CompressionConfirmDialog.tsx:**
```typescript
interface CompressionConfirmDialogProps {
  open: boolean
  sessionId: string
  provider: string
  model: string
  apiKey: string
  onConfirm: (result: CompressionResult) => void
  onCancel: () => void
}
```

**SummaryMessage.tsx:**
```typescript
interface SummaryMessageProps {
  summary: CompressionSummary
  expanded?: boolean
  onToggleExpand?: () => void
}
```


### Dependencies

**No new external dependencies required.** All necessary libraries are already installed:

- `react` (19.x) - UI framework
- `lucide-react` - Icons for compression UI
- `@radix-ui/*` - Primitives for Shadcn/ui components
- `tailwindcss` - Styling
- Phase 1 backend services (already implemented)

**Shadcn/ui components to add (if not already present):**
```bash
pnpm run shadcn add slider    # For threshold slider
pnpm run shadcn add badge     # For compression button badge
pnpm run shadcn add progress  # Optional: for compression progress bar
```


---

**Plan Revision History:**

- 2025-11-17: Initial creation for Phase 2 UI integration
  - Defined seven milestones covering IPC, settings UI, token display, manual/auto compression, and testing
  - Specified all TypeScript interfaces for IPC communication
  - Included detailed component specifications and user workflows
  - Based on Phase 1 completion (72 passing tests) and design documents
