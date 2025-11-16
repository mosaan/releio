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
- ⚠️ Mixed accuracy (exact for recorded, approximate for fallback)
- ⚠️ Requires storing token counts in DB (but fields already exist)

**Evaluation:**
This is the **best of both worlds**: precise when possible, practical when not.

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

### Selected Approach: **Alternative 3 - Hybrid (Record + Fallback)**

**Implementation:**

```typescript
function getMessageTokenCount(message: ChatMessage, tokenCounter: TiktokenCounter): number {
  // 1. Priority: Use recorded tokens if available
  if (message.inputTokens != null || message.outputTokens != null) {
    return (message.inputTokens ?? 0) + (message.outputTokens ?? 0);
  }

  // 2. Fallback: Calculate using tiktoken o200k_base
  return tokenCounter.count(message);
}
```

**Fallback Tokenizer: tiktoken o200k_base**

Chosen over cl100k_base because:
1. **Current mainstream**: GPT-4o is now the primary OpenAI model
2. **Efficiency**: o200k_base uses fewer tokens → conservative estimates at 95% threshold
3. **Future-proof**: Newer encoding likely to remain relevant
4. **Similar Claude/Gemini accuracy**: Both cl100k_base and o200k_base have ±10-15% error with other providers

---

## Rationale

### Why Not Strict Provider-Specific Counting?

The **goal is threshold detection, not billing accuracy**.

- **95% threshold provides buffer**: Even with ±15% error, we won't hit hard limits
- **API calls add latency**: 100-300ms per request for Anthropic/Gemini
- **Network failures**: Requires fallback logic anyway
- **Complexity**: 3x the code, testing, and maintenance

### Why Hybrid Approach?

1. **Best effort**: Uses exact data when available (from AI responses)
2. **Practical fallback**: tiktoken o200k_base is fast, free, and "good enough"
3. **Graceful degradation**: Always works, even without network or records
4. **Implementation simplicity**: One fallback tokenizer, minimal code

### Why tiktoken o200k_base?

- **GPT-4o mainstream**: Current and future OpenAI models
- **Conservative**: Fewer tokens → triggers compression slightly earlier (safer)
- **Acceptable accuracy**: ±10-15% error is fine for 95% threshold detection
- **Research basis**: Claude has 70% vocabulary overlap with GPT-4 tokenizers

### Accuracy Expectations

| Provider | Method | Expected Accuracy |
|----------|--------|-------------------|
| OpenAI GPT-4o | Recorded from response | **100%** (exact) |
| OpenAI GPT-4o | tiktoken o200k_base | **100%** (exact) |
| OpenAI GPT-4 | tiktoken o200k_base | **~98%** (slightly off) |
| Anthropic Claude | Recorded from response | **100%** (exact) |
| Anthropic Claude | tiktoken o200k_base | **85-90%** (±10-15%) |
| Google Gemini | Recorded from response | **100%** (exact) |
| Google Gemini | tiktoken o200k_base | **85-90%** (±10-15%) |

**Conclusion**: With 95% threshold and ±15% worst-case error, compression triggers between 80-110% of actual threshold. This is acceptable given the 5% safety margin.

---

## Implementation Requirements

### 1. Record Token Counts from AI Responses

**When:** After every AI request completes

**Where:** `src/backend/ai/stream.ts` or `src/renderer/src/components/AIRuntimeProvider.tsx`

**What to store:**
```typescript
// AI SDK response includes:
const { usage } = result;
// usage.promptTokens - tokens in the request
// usage.completionTokens - tokens in the response

// Store in database:
await db.update(chatMessages)
  .set({
    inputTokens: usage.promptTokens,
    outputTokens: usage.completionTokens
  })
  .where(eq(chatMessages.id, messageId));
```

### 2. Implement Fallback Token Counter

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

### 3. Simplify TokenCounter Service

**Remove:**
- Anthropic-specific API token counting
- Gemini-specific API token counting
- Provider-specific implementations

**Keep:**
- Single tiktoken o200k_base implementation
- Message token counting logic
- Conversation token aggregation

---

## Monitoring and Validation

### Metrics to Track

1. **Token count accuracy** (when using fallback):
   - Compare fallback counts with actual API usage
   - Log discrepancies > 20%

2. **Fallback usage rate**:
   - % of messages using fallback vs. recorded counts
   - Should decrease over time as more messages are recorded

3. **Compression trigger accuracy**:
   - False positives: Compressed but not near limit
   - False negatives: Hit limit without compression (most critical)

### Validation During Development

```typescript
// When recording tokens, compare with fallback for debugging
if (import.meta.env.DEV) {
  const recordedTokens = usage.promptTokens + usage.completionTokens;
  const fallbackTokens = tiktokenCounter.count(message);
  const errorPercent = Math.abs(recordedTokens - fallbackTokens) / recordedTokens * 100;

  if (errorPercent > 20) {
    logger.warn('High token count discrepancy', {
      provider,
      model,
      recordedTokens,
      fallbackTokens,
      errorPercent
    });
  }
}
```

---

## Future Considerations

### If Accuracy Becomes Critical

If future requirements demand higher accuracy:
1. **Phase 1 (current)**: Hybrid with tiktoken o200k_base fallback
2. **Phase 2 (if needed)**: Add provider-specific fallbacks
   - Still use recorded tokens as priority
   - Fallback to provider-specific API only when needed
   - Cache API results to minimize calls

### If New Providers Are Added

For new AI providers:
1. Check if provider returns token counts in response → use recorded tokens
2. If not, tiktoken o200k_base fallback remains valid
3. Monitor accuracy and adjust if needed

---

## References

### Research Sources

- [OpenAI tiktoken GitHub](https://github.com/openai/tiktoken)
- [Anthropic Token Counting (2025)](https://www.propelcode.ai/blog/token-counting-tiktoken-anthropic-gemini-guide-2025)
- [GPT-4o vs GPT-4 Tokenization](https://github.com/kaisugi/gpt4_vocab_list)

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
