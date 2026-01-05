# Conversation History Compression - Manual Testing Guide

**Version:** 1.0
**Date:** 2025-11-17
**Feature:** Phase 2 UI Integration
**Status:** Ready for Testing

This document provides comprehensive manual testing procedures for the Conversation History Compression feature (Phase 2 UI Integration).

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Test Environment Setup](#test-environment-setup)
3. [Test Scenarios](#test-scenarios)
   - [Test 1: Compression Settings UI](#test-1-compression-settings-ui)
   - [Test 2: Token Usage Display](#test-2-token-usage-display)
   - [Test 3: Manual Compression Workflow](#test-3-manual-compression-workflow)
   - [Test 4: Automatic Compression](#test-4-automatic-compression)
   - [Test 5: Multi-Level Compression](#test-5-multi-level-compression)
   - [Test 6: Error Handling](#test-6-error-handling)
4. [Performance Testing](#performance-testing)
5. [Edge Cases](#edge-cases)
6. [Regression Testing](#regression-testing)
7. [Test Results Template](#test-results-template)

---

## Prerequisites

### Required Setup

1. **Application Built and Running**
   ```bash
   pnpm install
   pnpm run dev
   ```

2. **AI Provider Configuration**
   - At least one AI provider configured (OpenAI, Anthropic, or Google)
   - Valid API key with sufficient credits
   - Recommended: Use Anthropic Claude or OpenAI GPT-4 for testing

3. **Database State**
   - Fresh database recommended for initial testing
   - Or use existing database with some chat sessions

4. **Development Tools**
   - Browser DevTools open (for console logs)
   - Log file accessible: `./tmp/logs/app.log`

### Recommended Test Models

- **Claude 3.5 Sonnet** (200K context): Best for compression testing
- **GPT-4 Turbo** (128K context): Good for testing
- **GPT-3.5 Turbo** (16K context): Quick threshold testing

---

## Test Environment Setup

### 1. Open Application

```bash
pnpm run dev
```

Wait for the application to fully load.

### 2. Verify Backend Connection

Open DevTools Console and check for:
```
✓ Backend connected
✓ No error messages
```

### 3. Create Test Session

1. Create a new chat session
2. Select a model (e.g., Claude 3.5 Sonnet)
3. Send a simple message: "Hello, this is a test"
4. Verify the AI responds

### 4. Check Logs

Tail the log file in a separate terminal:
```bash
tail -f ./tmp/logs/app.log
```

Look for:
```
[info] [renderer] AI stream completed
[info] [backend:compression] ...
```

---

## Test Scenarios

### Test 1: Compression Settings UI

**Objective:** Verify that compression settings can be configured and persisted.

#### Test Steps

1. **Open Settings Page**
   - Click the Settings icon (⚙️) in the chat header
   - Verify Settings page opens

2. **Navigate to Compression Section**
   - Scroll to "Conversation Compression" card
   - Verify it appears between "MCP Settings" and "Proxy Settings"

3. **Test Threshold Slider**
   - Move slider from default (95%) to different values
   - Verify percentage updates in real-time
   - Test boundary values:
     - Minimum: 70%
     - Maximum: 100%
     - Intermediate: 85%, 90%
   - **Expected:** Slider moves smoothly, percentage displays correctly

4. **Test Retention Tokens Input**
   - Click on the retention tokens input field
   - Enter different values:
     - 1000
     - 2000 (default)
     - 5000
   - Try invalid values:
     - Negative number: -100
     - Very large: 1000000
   - **Expected:** Valid values accepted, invalid values rejected or clamped

5. **Test Auto-Compression Toggle**
   - Click the auto-compression switch
   - Toggle ON → OFF → ON
   - **Expected:** Switch changes state visually

6. **Save Settings**
   - Change all three settings:
     - Threshold: 90%
     - Retention Tokens: 3000
     - Auto-Compress: ON
   - Click "Save Settings" button
   - **Expected:**
     - Button shows "Saving..." briefly
     - Button shows "Saved" with checkmark
     - Green background appears temporarily
     - Success indicator disappears after 3 seconds

7. **Verify Persistence**
   - Close Settings page (click back arrow)
   - Reopen Settings page
   - Navigate to Compression section
   - **Expected:** All settings show saved values:
     - Threshold: 90%
     - Retention Tokens: 3000
     - Auto-Compress: ON

8. **Verify Database Persistence**
   - Close the application completely
   - Restart: `pnpm run dev`
   - Open Settings → Compression
   - **Expected:** Settings still show saved values

#### Expected Results ✅

- [x] Settings UI renders correctly
- [x] Threshold slider works (70-100%)
- [x] Retention tokens input accepts valid values
- [x] Auto-compress toggle works
- [x] Save button shows feedback
- [x] Settings persist across page navigation
- [x] Settings persist across app restarts

#### Known Issues / Notes

- Slider styling may differ slightly on different operating systems
- Default sessionId is "global-defaults" (future: per-session settings)

---

### Test 2: Token Usage Display

**Objective:** Verify real-time token usage indicator works correctly.

#### Test Steps

1. **Start New Chat Session**
   - Create a new session or select an existing one
   - Select a model (e.g., Claude 3.5 Sonnet)

2. **Observe Initial State**
   - Look at the chat header (next to model selector)
   - **Expected:** Token usage indicator appears
     - Format: "XXX / 200,000 (0.X%)"
     - Color: Green (text-green-600)
     - Icon: Activity icon

3. **Send First Message**
   - Send: "Hello, how are you today?"
   - Wait for AI response
   - **Expected:** Token count increases
     - Example: "245 / 200,000 (0.1%)"
     - Color: Still green

4. **Send Multiple Messages**
   - Send 5-10 conversational messages
   - Wait for responses
   - **Expected:** Token count progressively increases
     - Updates within 3 seconds after each message
     - Percentage updates accordingly

5. **Test Color Transitions**

   To test this, you'll need to send many messages or use a smaller context model:

   - **Green (< 70%):**
     - Send messages until token usage < 70%
     - **Expected:** Green color (text-green-600)

   - **Yellow (70-90%):**
     - Continue sending messages until 70-90%
     - **Expected:** Yellow color (text-yellow-600)

   - **Orange (90-95%):**
     - Continue until 90-95%
     - **Expected:** Orange color (text-orange-600)

   - **Red (> 95%):**
     - Continue until > 95%
     - **Expected:** Red color (text-red-600)

6. **Test Tooltip**
   - Hover mouse over token usage indicator
   - **Expected:** Tooltip appears showing:
     ```
     Token Usage Details

     Input tokens:     XXX
     Output tokens:    XXX
     Estimated response: XXX
     Total usage:      XXX

     Context limit:    200,000
     Utilization:      X.XX%
     Threshold:        95%
     ```

   - If near threshold: "⚠️ Compression recommended" appears

7. **Test Auto-Refresh**
   - Send a message
   - Watch the indicator without interacting
   - **Expected:** Updates within 3 seconds of AI response completion

8. **Test Session Switch**
   - Switch to a different chat session
   - **Expected:** Token count updates to new session's count
   - Color adjusts based on new session's usage

9. **Test Model Switch**
   - Change model (e.g., from Claude to GPT-4)
   - **Expected:**
     - Max tokens change (200K → 128K)
     - Percentage recalculates
     - Color may change based on new percentage

#### Expected Results ✅

- [x] Token indicator appears in chat header
- [x] Shows current/max tokens and percentage
- [x] Updates in real-time (within 3 seconds)
- [x] Color coding works correctly:
  - [x] Green < 70%
  - [x] Yellow 70-90%
  - [x] Orange 90-95%
  - [x] Red > 95%
- [x] Tooltip shows detailed breakdown
- [x] Tooltip shows compression warning when needed
- [x] Updates correctly on session switch
- [x] Updates correctly on model switch

#### Known Issues / Notes

- Polling interval is 3 seconds (configurable)
- Token counting is approximate until backend confirms
- Indicator hides if no session or model selected

---

### Test 3: Manual Compression Workflow

**Objective:** Verify manual compression can be triggered and works end-to-end.

#### Test Steps

1. **Create Compression Scenario**

   **Option A: Quick Test (Smaller Context Model)**
   - Use GPT-3.5 Turbo (16K context)
   - Send ~30 messages until token usage > 90%

   **Option B: Realistic Test (Larger Context Model)**
   - Use Claude 3.5 Sonnet (200K context)
   - Send ~100 messages until token usage > 95%

   **Message Template for Bulk Testing:**
   ```
   Message 1: "Tell me about the history of computers"
   Message 2: "What were the key innovations in the 1980s?"
   Message 3: "How did personal computers change society?"
   ... continue conversation ...
   ```

2. **Wait for Compress Button to Appear**
   - After token usage exceeds threshold (default 95%)
   - Check compression is needed every 5 seconds
   - **Expected:** Orange "Compress" button appears in header
     - Text: "Compress" (hidden on small screens)
     - Icon: Archive icon
     - Color: Orange border and text

3. **Click Compress Button**
   - Click the "Compress" button
   - **Expected:** Preview dialog opens immediately

4. **Verify Compression Preview Dialog**

   **Dialog Should Show:**
   - Title: "Compress Conversation" with Archive icon
   - Description: "This will summarize older messages to free up context space for new messages."

   **Statistics Panel:**
   - Current Tokens: XXX (formatted with commas)
   - After Compression: XXX (green background)
   - Compression Details:
     - Messages to compress: XX
     - Token savings: XXX (XX.X%)

   **Buttons:**
   - "Cancel" button (enabled)
   - "Compress" button (enabled, blue background)

5. **Cancel Compression**
   - Click "Cancel"
   - **Expected:**
     - Dialog closes
     - No changes to chat
     - Compress button still visible

6. **Trigger Compression**
   - Click "Compress" button again
   - In dialog, click "Compress" button
   - **Expected:**
     - Button shows "Compressing..." with spinner
     - Cancel button disabled
     - Dialog stays open during compression

7. **Wait for Compression to Complete**
   - Watch for completion (5-15 seconds typically)
   - **Expected:**
     - Dialog closes automatically
     - Chat view refreshes
     - Messages reload

8. **Verify Post-Compression State**

   **Check Token Usage:**
   - Token count significantly reduced
   - Color likely green or yellow
   - Percentage much lower

   **Check Compress Button:**
   - Should disappear (compression no longer needed)

   **Check Console Logs:**
   ```
   [info] [Compression] Compression completed successfully
   ```

   **Check Chat History:**
   - Older messages still visible
   - Recent messages preserved (based on retention tokens)

9. **Verify Chat Still Works**
   - Send a new message: "Can you summarize our conversation?"
   - **Expected:** AI responds normally with context awareness

#### Expected Results ✅

- [x] Compress button appears when threshold exceeded
- [x] Button opens preview dialog
- [x] Preview shows accurate statistics:
  - [x] Current token count
  - [x] Expected new token count
  - [x] Messages to compress count
  - [x] Token savings percentage
- [x] Cancel button works
- [x] Compress button triggers compression
- [x] Loading state shown during compression
- [x] Dialog closes on completion
- [x] Token count drops significantly
- [x] Compress button disappears
- [x] Chat functionality preserved
- [x] AI maintains context awareness

#### Known Issues / Notes

- Compression takes 5-15 seconds depending on message count
- Very large conversations (500+ messages) may take longer
- If compression fails, error appears in dialog
- Summary is used for AI context but not displayed as a message (Phase 2 limitation)

---

### Test 4: Automatic Compression

**Objective:** Verify automatic compression triggers correctly when enabled.

#### Test Steps

1. **Configure Auto-Compression**
   - Open Settings → Compression
   - Set:
     - Threshold: 90% (for easier testing)
     - Retention Tokens: 2000
     - Auto-Compress: **ON**
   - Save settings

2. **Create Fresh Session**
   - Create a new chat session
   - Select model (GPT-3.5 Turbo recommended for faster testing)
   - Note: Start with empty conversation

3. **Send Messages to Approach Threshold**
   - Send conversational messages until token usage reaches ~85%
   - Monitor token indicator
   - **Expected:** Token usage increases gradually

4. **Send Message to Cross Threshold**
   - Continue sending messages
   - When token usage exceeds 90%
   - Send one more message
   - **Expected:**
     - Message input field clears
     - Message appears to be sending normally
     - Check logs for compression trigger:
       ```
       [info] [Compression] Auto-compression triggered
       ```

5. **Observe Auto-Compression**
   - Watch the chat interface
   - **Expected:**
     - No blocking UI (chat remains responsive)
     - Compression happens in background
     - Logs show:
       ```
       [info] [Compression] Auto-compression completed successfully
       ```

6. **Verify Message Sent After Compression**
   - Wait for AI response
   - **Expected:**
     - Original message was sent to AI
     - AI responds normally
     - Response appears in chat
     - Context is preserved (AI remembers conversation)

7. **Check Post-Compression State**
   - Check token indicator
   - **Expected:**
     - Token count much lower
     - Color improved (e.g., orange → green)
     - Percentage below threshold

8. **Verify Continuous Operation**
   - Continue sending messages
   - Approach threshold again
   - **Expected:** Auto-compression triggers again if needed

9. **Test Auto-Compression Disabled**
   - Go to Settings → Compression
   - Set Auto-Compress: **OFF**
   - Save
   - Send messages to exceed threshold
   - **Expected:**
     - No auto-compression
     - Manual compress button appears instead
     - Messages still send normally

#### Expected Results ✅

- [x] Auto-compression triggers when threshold exceeded
- [x] No blocking UI during compression
- [x] Compression logged in console
- [x] Original message sent successfully after compression
- [x] AI response received normally
- [x] Token count drops after compression
- [x] Can trigger multiple auto-compressions
- [x] Can disable auto-compression via settings
- [x] Manual compress button appears when auto-compress disabled

#### Known Issues / Notes

- Auto-compression happens **before** sending the new message
- If compression fails, message still sends (non-blocking)
- Compression typically completes in 5-15 seconds
- Session refresh happens automatically via existing callback

---

### Test 5: Multi-Level Compression

**Objective:** Verify that compression can be performed multiple times on the same session.

#### Test Steps

1. **Perform First Compression**
   - Follow Test 3 or Test 4 to perform initial compression
   - Verify token count drops
   - Note the new token count (e.g., 5,000 tokens)

2. **Continue Conversation**
   - Send more messages (30-50 additional messages)
   - Approach threshold again
   - **Expected:** Token usage increases again

3. **Trigger Second Compression**
   - **If auto-compress enabled:** Send message to cross threshold
   - **If manual:** Wait for compress button, click it
   - **Expected:**
     - Compression triggers
     - Logs show second compression
     - Token count drops again

4. **Verify Second Compression**
   - Check logs for:
     ```
     [info] [Compression] Auto-compression completed successfully
     messagesCompressed: XX
     originalTokenCount: ~XX,XXX
     newTokenCount: ~X,XXX
     ```
   - **Expected:**
     - Second summary created
     - New summary includes reference to previous summary
     - Token count significantly reduced again

5. **Test Multiple Compressions**
   - Repeat steps 2-4 several times (3-5 compressions total)
   - **Expected:**
     - Each compression successful
     - Token count keeps dropping
     - No errors or degradation

6. **Verify Context Preservation**
   - After multiple compressions, ask:
     - "What did we discuss at the very beginning of our conversation?"
     - "Can you summarize our entire conversation?"
   - **Expected:**
     - AI has context from early messages (via summaries)
     - AI can reference key points from entire history
     - Responses are coherent

#### Expected Results ✅

- [x] Multiple compressions can be performed on same session
- [x] Each compression reduces token count
- [x] Second compression includes previous summary
- [x] Context preserved across compressions
- [x] No errors after multiple compressions
- [x] AI maintains conversation awareness

#### Known Issues / Notes

- Backend Phase 1 integration tests cover up to 3-level compression
- Theoretical limit: unlimited compressions
- Each summary is stored in `session_snapshots` table
- Summary quality may degrade slightly after many compressions (rare)

---

### Test 6: Error Handling

**Objective:** Verify graceful error handling in various failure scenarios.

#### Test Steps

1. **Test Invalid API Key**
   - Go to Settings → AI Settings
   - Change API key to invalid value: `sk-invalid-key-12345`
   - Save
   - Trigger manual compression
   - **Expected:**
     - Preview loads (doesn't need API key)
     - When clicking "Compress", error appears in dialog
     - Error message: "Compression failed: [API error details]"
     - Chat remains functional
     - Can close dialog and try again later

2. **Test Network Disconnection**
   - Disconnect network (turn off Wi-Fi or use DevTools Network throttling)
   - Set to "Offline" in DevTools
   - Trigger compression
   - **Expected:**
     - Compression fails
     - Error message: "Compression failed: Network error"
     - Logs show error
     - Can retry after reconnecting

3. **Test Empty Session**
   - Create brand new session
   - Don't send any messages
   - Try to trigger compression manually
   - **Expected:**
     - Compress button doesn't appear
     - If manually triggered via API: error message "No messages to compress"

4. **Test Session with Single Message**
   - Create new session
   - Send only 1 message
   - **Expected:**
     - Token usage shows
     - Compress button doesn't appear (below threshold)
     - If forced: "Not enough messages to compress"

5. **Test Rapid Compressions**
   - Trigger compression
   - Immediately try to trigger again
   - **Expected:**
     - First compression proceeds
     - Second attempt either:
       - Waits for first to complete, or
       - Shows "Compression in progress"
     - No race conditions or corruption

6. **Test Invalid Threshold**
   - Try to set threshold to invalid values via DevTools console:
     ```javascript
     await window.backend.setCompressionSettings('session-id', {
       threshold: 1.5,  // Invalid: > 1.0
       retentionTokens: -100,  // Invalid: negative
       autoCompress: true
     })
     ```
   - **Expected:**
     - Backend returns error
     - Settings not saved
     - Current settings unchanged

7. **Test Model Switch During Compression**
   - Trigger compression
   - While compressing, switch model
   - **Expected:**
     - Compression completes with original model
     - New model selection takes effect after compression
     - No errors

8. **Test Session Switch During Compression**
   - Trigger compression
   - While compressing, switch to different session
   - **Expected:**
     - Compression continues in background
     - UI shows new session
     - Compression completes for original session
     - Logs confirm completion

#### Expected Results ✅

- [x] Invalid API key: Error shown, chat functional
- [x] Network error: Error shown, can retry
- [x] Empty session: Compress button hidden
- [x] Single message: Compression not needed
- [x] Rapid compressions: Handled gracefully
- [x] Invalid settings: Rejected with error
- [x] Model switch during compression: Handled correctly
- [x] Session switch during compression: Handled correctly

#### Known Issues / Notes

- All compression errors logged to `./tmp/logs/app.log`
- Errors don't block chat functionality (graceful degradation)
- API errors include full error message from provider

---

## Performance Testing

### Test 7: Large Conversation Compression

**Objective:** Verify compression works efficiently with large conversations.

#### Test Steps

1. **Create Large Conversation**
   - Generate 200+ messages (can use script or manual sending)
   - Use a model with large context (Claude 3.5 Sonnet)

2. **Measure Compression Time**
   - Trigger compression
   - Time from click to completion
   - **Expected:** < 30 seconds for 200 messages
   - **Acceptable:** < 60 seconds for 500 messages

3. **Verify UI Responsiveness**
   - During compression:
     - Try scrolling chat
     - Try typing in other sessions
     - Try opening settings
   - **Expected:** All UI remains responsive (non-blocking)

4. **Check Memory Usage**
   - Monitor in DevTools Performance/Memory
   - **Expected:** No memory leaks during compression

5. **Verify Accuracy**
   - After compression, ask AI to summarize conversation
   - **Expected:** AI can recall major topics and key points

#### Expected Results ✅

- [x] 100 messages: < 15 seconds
- [x] 200 messages: < 30 seconds
- [x] 500 messages: < 60 seconds
- [x] UI remains responsive
- [x] No memory leaks
- [x] Context preserved accurately

---

## Edge Cases

### Test 8: Edge Case Scenarios

1. **Very Short Messages**
   - Send 50 one-word messages
   - Trigger compression
   - **Expected:** Works correctly, though token savings minimal

2. **Very Long Messages**
   - Send messages with 1000+ words each
   - Trigger compression
   - **Expected:** Works correctly, significant token savings

3. **Code Blocks in Messages**
   - Send messages with code snippets
   - Trigger compression
   - **Expected:** Code preserved in summary or context

4. **Multiple Languages**
   - Send messages in different languages (English, Japanese, Spanish)
   - Trigger compression
   - **Expected:** All languages handled correctly

5. **Tool Invocations (MCP)**
   - Have conversation with MCP tool calls
   - Trigger compression
   - **Expected:** Tool results included in compression

6. **Rapid Message Sending**
   - Send 20 messages rapidly (copy-paste)
   - **Expected:** Token counter updates correctly
   - Auto-compression triggers if threshold exceeded

---

## Regression Testing

### Test 9: Verify No Regressions

**Objective:** Ensure compression feature doesn't break existing functionality.

#### Test Steps

1. **Basic Chat Functionality**
   - Send messages without any compression
   - **Expected:** Works as before Phase 2

2. **Model Selection**
   - Switch between models
   - **Expected:** Model switching works normally

3. **Session Management**
   - Create, rename, delete sessions
   - **Expected:** All session operations work

4. **Settings Page**
   - All other settings (AI, MCP, Proxy, Certificate)
   - **Expected:** All settings functional

5. **Message Deletion**
   - Delete individual messages
   - **Expected:** Works correctly, token count updates

6. **Session History**
   - Switch between sessions
   - **Expected:** Messages load correctly

---

## Test Results Template

### Test Session Information

```
Date:               _______________
Tester:            _______________
Application Version: _______________
OS:                _______________
Model Used:        _______________
```

### Test Results Checklist

| Test ID | Test Name | Status | Notes |
|---------|-----------|--------|-------|
| T1 | Compression Settings UI | ☐ Pass ☐ Fail | |
| T2 | Token Usage Display | ☐ Pass ☐ Fail | |
| T3 | Manual Compression | ☐ Pass ☐ Fail | |
| T4 | Automatic Compression | ☐ Pass ☐ Fail | |
| T5 | Multi-Level Compression | ☐ Pass ☐ Fail | |
| T6 | Error Handling | ☐ Pass ☐ Fail | |
| T7 | Performance | ☐ Pass ☐ Fail | |
| T8 | Edge Cases | ☐ Pass ☐ Fail | |
| T9 | Regression Testing | ☐ Pass ☐ Fail | |

### Issues Found

| Issue ID | Severity | Description | Steps to Reproduce |
|----------|----------|-------------|-------------------|
| | | | |

### Overall Assessment

- [ ] All critical tests passed
- [ ] All tests passed
- [ ] Some non-critical issues found
- [ ] Critical issues found - feature not ready

### Tester Sign-off

```
Tested by: _______________
Date: _______________
Signature: _______________
```

---

## Troubleshooting

### Common Issues

**Issue:** Token indicator doesn't appear
- **Solution:** Check that session and model are selected

**Issue:** Compress button doesn't appear
- **Solution:**
  - Check token usage is > threshold (default 95%)
  - Wait 5 seconds for polling cycle

**Issue:** Compression fails with "API error"
- **Solution:**
  - Check API key is valid
  - Check API credits available
  - Check network connection

**Issue:** Settings don't persist
- **Solution:**
  - Check database file isn't read-only
  - Check logs for database errors

**Issue:** Token count seems inaccurate
- **Solution:**
  - Wait 3 seconds for update
  - Refresh session
  - Check logs for errors

### Log Locations

- **Application logs:** `./tmp/logs/app.log`
- **Database:** `./tmp/db/app.db`

### Useful Commands

```bash
# Watch logs in real-time
tail -f ./tmp/logs/app.log

# Filter compression logs
grep "Compression" ./tmp/logs/app.log

# Check database
sqlite3 ./tmp/db/app.db "SELECT * FROM session_snapshots"

# Check settings
sqlite3 ./tmp/db/app.db "SELECT key, value FROM settings WHERE key LIKE '%compression%'"
```

---

## Appendix

### Keyboard Shortcuts

- **Open Settings:** None (click gear icon)
- **Send Message:** Enter
- **New Session:** Ctrl/Cmd + N

### Test Data Generators

**Bulk Message Script (Browser Console):**
```javascript
// Generate 50 test messages
for (let i = 1; i <= 50; i++) {
  setTimeout(() => {
    const input = document.querySelector('textarea[placeholder*="message"]');
    input.value = `Test message ${i}: This is a longer message to generate more tokens and approach the compression threshold faster.`;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    // Submit form programmatically or click send button
  }, i * 2000); // 2 seconds between messages
}
```

**Note:** Automated message sending should be used carefully to avoid rate limits.

---

**End of Manual Testing Guide**

For automated testing procedures, see `docs/COMPRESSION_AUTOMATED_TESTING.md` (future).

For feature design and architecture, see:
- `docs/CONVERSATION_HISTORY_COMPRESSION_REQUIREMENTS.md`
- `docs/CONVERSATION_HISTORY_COMPRESSION_DESIGN.md`
