# Token Counting Strategy - Design Decision

## Overview

This document records the design decision for token counting in the conversation history compression feature. It captures the alternatives considered, the evaluation criteria, and the rationale for the chosen approach.

## Context

The conversation history compression feature requires accurate token counting to:
1. Determine when compression is needed (approaching context limit)
2. Calculate retention boundaries (token-based message retention)
3. Track compression effectiveness (before/after token counts)

## Problem Statement

**How should we count tokens for conversations that may use different AI providers (OpenAI, Anthropic, Google)?**

### Key Challenges

1. **Provider-specific tokenization**: Each provider uses a different tokenizer
   - OpenAI: tiktoken (cl100k_base, o200k_base)
   - Anthropic: Custom BPE tokenizer (65K vocab, 70% overlap with GPT-4)
   - Google Gemini: Multimodal tokenizer (proprietary)

2. **Performance vs. Accuracy tradeoff**
   - Accurate counting requires API calls (Anthropic, Gemini)
   - API calls add latency and cost
   - Local tokenizers are fast but may have accuracy trade-offs

3. **Complexity vs. Simplicity**
   - Multiple tokenizer implementations increase code complexity
   - Maintenance burden for provider-specific code
   - Error handling for network failures

## Alternatives Considered

### Alternative 1: Strict Provider-Specific Token Counting

**Approach:**
- Use each provider's official tokenization method
- OpenAI: tiktoken library (local)
- Anthropic: `countTokens` API (network call)
- Google Gemini: `countTokens` API (network call)

**Pros:**
- ✅ Most accurate token counts for each provider
- ✅ Matches billing exactly
- ✅ No approximation errors

**Cons:**
- ❌ High complexity: 3 different implementations
- ❌ Network latency for Anthropic/Gemini (adds 100-300ms per count)
- ❌ Additional API costs (Anthropic/Gemini charge for countTokens)
- ❌ Network failures require fallback logic anyway
- ❌ Cannot count tokens offline

**Evaluation:**
This approach is **over-engineered** for the use case. The goal is to detect "approaching 95% of context limit," not to calculate billing. ±10-15% accuracy is sufficient.

---

### Alternative 2: Universal tiktoken (cl100k_base or o200k_base)

**Approach:**
- Use a single tiktoken encoding for all providers
- Fast, local, no network calls

**Option 2a: cl100k_base**
- Used by GPT-4, GPT-3.5-turbo
- 70% vocabulary overlap with Claude
- Proven compatibility

**Option 2b: o200k_base**
- Used by GPT-4o, GPT-4o-mini
- More efficient (fewer tokens for same text)
- Newer encoding, better future-proofing

**Pros:**
- ✅ Simple: single tokenizer implementation
- ✅ Fast: local processing, no network calls
- ✅ Zero additional cost
- ✅ Always available (offline-capable)
- ✅ Sufficient accuracy for threshold detection (±10-15% error)

**Cons:**
- ❌ Inaccurate for Anthropic/Gemini (but within acceptable range)
- ❌ Does not match billing exactly

**Evaluation:**
This approach balances **simplicity and practicality**. Since the purpose is threshold detection (not billing), the ±10-15% error is acceptable given the 95% threshold.

---

### Alternative 3: Hybrid Approach (Record + Fallback)

**Approach:**
1. **Priority: Use recorded token counts** from AI responses
   - AI SDK returns `usage: { promptTokens, completionTokens }` in every response
   - Store these in DB (`inputTokens`, `outputTokens` fields)
2. **Fallback: Use tiktoken o200k_base** when no record exists
   - For messages before feature implementation
   - For estimating current user input before sending

**Pros:**
- ✅ **Best-effort accuracy**: Uses exact counts when available
- ✅ **Simple implementation**: Single fallback tokenizer
- ✅ **Fast**: No additional API calls
- ✅ **Zero additional cost**
- ✅ **Graceful degradation**: Always works, even without records
- ✅ **Migration-friendly**: Works with existing messages

**Cons:**
- ❌ **Fatal flaw: Token counts unavailable when needed**
  - Compression decisions must be made **before** sending requests to AI providers
  - API responses only return token counts **after** the request completes
  - Cannot determine "should we compress?" without knowing current + new message token count
- ❌ **API response token counts are cumulative**, not per-message
  - `promptTokens` includes the entire conversation history, system messages, tool definitions, etc.
  - Cannot extract individual message token counts from these cumulative values
  - Recorded values cannot be used to calculate context consumption accurately

**Evaluation:**
**REJECTED.** While elegant in theory, this approach has fundamental timing and data granularity issues that make it unsuitable for compression decision-making.

---

### Alternative 4: Character Count Approximation

**Approach:**
- Token count ≈ character count / 4 (English heuristic)

**Pros:**
- ✅ Ultra-simple: no library needed
- ✅ Instant calculation

**Cons:**
- ❌ High error rate (±30-50%)
- ❌ Unreliable for JSON/code (tool calls)
- ❌ Poor handling of non-English text

**Evaluation:**
**Rejected.** Too inaccurate for reliable threshold detection.

---

## Decision

### Selected Approach: **Alternative 2 - Universal tiktoken o200k_base**

**Implementation:**

```typescript
import { get_encoding } from 'tiktoken';

class TokenCounter {
  private encoding: Tiktoken;

  constructor() {
    this.encoding = get_encoding('o200k_base');
  }

  countMessageTokens(message: ChatMessage): number {
    // Always calculate locally - no hybrid logic
    return this.calculateTokens(message);
  }

  private calculateTokens(message: ChatMessage): number {
    let tokenCount = 4; // Message overhead

    for (const part of message.parts) {
      if (part.kind === 'text' && part.content) {
        tokenCount += this.encoding.encode(part.content).length;
      }
      // ... handle tool calls, attachments, etc.
    }

    return tokenCount;
  }

  dispose() {
    this.encoding.free();
  }
}
```

**Tokenizer Choice: tiktoken o200k_base (recommended, not mandatory)**

Chosen over cl100k_base because:
1. **Current mainstream**: GPT-4o is now the primary OpenAI model
2. **Efficiency**: o200k_base uses fewer tokens → conservative estimates at 95% threshold
3. **Future-proof**: Newer encoding likely to remain relevant
4. **Similar Claude/Gemini accuracy**: Both cl100k_base and o200k_base have ±10-15% error with other providers

**Note:** Alternative tokenizers MAY be used if they provide better accuracy or performance.

---

## Rationale

### Why Not Strict Provider-Specific Counting?

The **goal is threshold detection, not billing accuracy**.

- **95% threshold provides buffer**: Even with ±15% error, we won't hit hard limits
- **API calls add latency**: 100-300ms per request for Anthropic/Gemini
- **Network failures**: Requires fallback logic anyway
- **Complexity**: 3x the code, testing, and maintenance
- **Still need local calculation**: Even with API-based counting, we need local calculation for the current user input before sending

### Why Not Hybrid Approach (Recorded + Fallback)?

While initially attractive, this approach has **fundamental flaws**:

1. **Timing problem**: Compression decisions must happen **before** sending requests
   - We need token counts to decide: "Should we compress before sending this message?"
   - API responses return token counts **after** the request completes
   - By then, it's too late to make compression decisions

2. **Granularity problem**: API response token counts are cumulative
   - `usage.promptTokens` includes entire history + system messages + tool definitions + current input
   - We cannot extract individual message token counts from these cumulative values
   - Cannot use recorded values to calculate "how many tokens does message X consume?"

3. **Still need local calculation**: Even with recorded values, we must calculate locally for:
   - Current user input (before sending)
   - New messages (before API response)
   - Compression decision-making

**Conclusion:** Since local calculation is always required, hybrid approach adds complexity without meaningful benefit.

### Why Universal tiktoken o200k_base?

- **Always available**: Works before and after API calls, no network dependency
- **Fast**: Local processing, no latency
- **Free**: No additional API costs
- **Simple**: Single tokenizer implementation, easy to maintain
- **Good enough**: ±10-15% error is acceptable for 95% threshold detection
- **Conservative**: Fewer tokens → triggers compression slightly earlier (safer)
- **Acceptable accuracy**: Research shows Claude has 70% vocabulary overlap with GPT-4 tokenizers

### Accuracy Expectations

| Provider | Method | Expected Accuracy |
|----------|--------|-------------------|
| OpenAI GPT-4o | tiktoken o200k_base | **100%** (exact) |
| OpenAI GPT-4 | tiktoken o200k_base | **~98%** (slightly off) |
| OpenAI GPT-3.5 | tiktoken o200k_base | **~98%** (slightly off) |
| Anthropic Claude | tiktoken o200k_base | **85-90%** (±10-15%) |
| Google Gemini | tiktoken o200k_base | **85-90%** (±10-15%) |
| Azure OpenAI | tiktoken o200k_base | **100%** (exact for GPT-4o) |

**Practical Impact:**
- ±10-15% error is acceptable because:
  - 95% threshold provides 5% buffer
  - Safety margin (additional 5%) provides another 5% buffer
  - Total buffer: ~10% before hitting hard context limits
  - Conservative tokenizer (o200k_base uses fewer tokens) triggers compression slightly earlier
- With 95% threshold and ±15% worst-case error, compression triggers between 80-110% of actual threshold
- This is acceptable and safe given the built-in safety margins

---

## Implementation Requirements

### 1. Implement Local Token Counter

**Where:** `src/backend/compression/TokenCounter.ts`

**Dependencies:**
```json
{
  "dependencies": {
    "tiktoken": "^1.0.0"
  }
}
```

**Implementation:**
```typescript
import { get_encoding } from 'tiktoken';

class TiktokenCounter {
  private encoding = get_encoding('o200k_base');

  count(message: ChatMessage): number {
    let tokenCount = 0;

    // Count message role and structure overhead (rough estimate: 4 tokens)
    tokenCount += 4;

    // Count text content
    for (const part of message.parts) {
      if (part.kind === 'text' && part.contentText) {
        tokenCount += this.encoding.encode(part.contentText).length;
      }

      // Count tool invocations as JSON
      if (part.kind === 'tool_invocation' && part.contentJson) {
        const jsonString = JSON.stringify(JSON.parse(part.contentJson));
        tokenCount += this.encoding.encode(jsonString).length;
      }

      // Count tool results
      if (part.kind === 'tool_result' && part.contentJson) {
        const jsonString = JSON.stringify(JSON.parse(part.contentJson));
        tokenCount += this.encoding.encode(jsonString).length;
      }

      // Count attachment metadata (not content)
      if (part.kind === 'attachment' && part.contentText) {
        // Metadata: filename + MIME type
        tokenCount += this.encoding.encode(part.contentText).length;
      }
    }

    return tokenCount;
  }

  dispose() {
    this.encoding.free();
  }
}
```

### 2. Optional: Record API Response Token Counts

**Purpose:** Analytics and performance monitoring only (NOT for compression decisions)

**When:** After every AI request completes

**Where:** `src/backend/ai/stream.ts`

**What to store:**
```typescript
// AI SDK response includes:
const { usage } = result;

// MAY store in database for monitoring:
await db.update(chatMessages)
  .set({
    inputTokens: usage.promptTokens,  // Cumulative count (for reference only)
    outputTokens: usage.completionTokens  // For reference only
  })
  .where(eq(chatMessages.id, messageId));
```

**Note:** These values are cumulative and MUST NOT be used for compression logic.

---

## Monitoring and Validation

### Metrics to Track

1. **Compression trigger accuracy**:
   - False positives: Compressed but not near limit (acceptable, better safe than sorry)
   - False negatives: Hit limit without compression (critical issue to investigate)

2. **Token count validation** (optional, development only):
   - Compare local counts with API response cumulative counts
   - Log large discrepancies for investigation
   - Expected: Some discrepancy due to system messages, tool definitions, and message overhead

### Validation During Development (Optional)

```typescript
// Compare local calculation with API response for debugging
if (import.meta.env.DEV && usage) {
  const localTokens = tokenCounter.countConversationTokens(messages).totalTokens;
  const apiTokens = usage.promptTokens;
  const diff = Math.abs(localTokens - apiTokens);
  const errorPercent = (diff / apiTokens) * 100;

  if (errorPercent > 20) {
    logger.debug('Token count discrepancy (expected)', {
      provider,
      model,
      local: localTokens,
      api: apiTokens,
      difference: diff,
      errorPercent: errorPercent.toFixed(1) + '%',
      note: 'API tokens include system messages, tool definitions, and formatting overhead'
    });
  }
}
```

**Note:** Discrepancies are expected and normal. API counts include overhead not present in our simplified local calculation.

---

## Future Considerations

### If Accuracy Becomes Critical

If future requirements demand higher accuracy for non-OpenAI providers:

**Option 1: Provider-Specific Tokenizers**
- Implement Anthropic/Gemini tokenizers if they become available as offline libraries
- Still requires local calculation (cannot use API calls before request)
- Increases complexity but improves accuracy

**Option 2: Better Universal Tokenizers**
- Research and adopt newer universal tokenizers with better cross-provider accuracy
- Example: Future BPE encodings designed for multi-provider support

**Current Assessment:** Not needed. ±10-15% error is acceptable for threshold detection.

### If New Providers Are Added

For new AI providers:
1. Default to tiktoken o200k_base (simple, fast, good enough)
2. Monitor compression trigger accuracy
3. If critical issues arise, investigate provider-specific tokenization
4. Prefer local calculation methods over API calls

---

## References

### Research Sources

- [OpenAI tiktoken GitHub](https://github.com/openai/tiktoken)
- [Anthropic Token Counting (2025)](https://www.propelcode.ai/blog/token-counting-tiktoken-anthropic-gemini-guide-2025)
- [GPT-4o vs GPT-4 Tokenization](https://github.com/kaisugi/gpt4_vocab_list)

---

**Document Version:** 2.0
**Last Updated:** 2025-11-16
**Status:** Final - Reflects Local-Only Token Counting Approach

**Changes in v2.0:**
- **Alternative 3 (Hybrid)**: Added fatal flaws and marked as REJECTED
  - Token counts unavailable before sending requests
  - API response tokens are cumulative, not per-message
- **Decision**: Changed from Alternative 3 (Hybrid) to Alternative 2 (Universal tiktoken)
- **Implementation**: Removed hybrid logic; always calculate locally
- **Rationale**: Added "Why Not Hybrid Approach?" section with detailed explanation
- **Monitoring**: Updated to reflect local-only approach
- **Future Considerations**: Removed hybrid-related content

**Changes in v1.0:**
- Initial version documenting hybrid approach decision

### Key Findings

- Claude tokenizer: 70% vocabulary overlap with GPT-4 cl100k_base
- o200k_base vs cl100k_base: o200k_base more efficient (fewer tokens)
- No accurate offline tokenizer for Claude 3+
- All providers return token usage in API responses

---

**Document Version:** 1.0
**Date:** 2025-11-16
**Status:** Approved for Implementation
**Decision Maker:** Architecture Review (based on user feedback)
