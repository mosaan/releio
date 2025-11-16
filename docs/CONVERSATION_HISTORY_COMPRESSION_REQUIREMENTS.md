# Conversation History Compression Requirements

## Overview

This document defines the requirements for implementing conversation history compression functionality in the application. The feature aims to manage context size efficiently by automatically summarizing older messages when approaching model token limits, while preserving recent conversation context.

## Background

### Current Implementation Status

Based on codebase analysis:

- **Database schema** includes unused token tracking fields:
  - `chatMessages.inputTokens` (nullable)
  - `chatMessages.outputTokens` (nullable)
  - `sessionSnapshots.tokenCount`
- **Session snapshots table** exists with compression-ready design:
  - `messageCutoffId` field for marking compression boundaries
  - `kind` field supporting 'title', 'summary', 'memory' types
  - `contentJson` for storing summarized content
- **Current behavior**: All conversation history is sent to AI providers without context management
- **No active token counting** or context window management

### AI Provider Context Limits

| Provider | Model | Context Window | Max Output | Tokenization Method |
|----------|-------|----------------|------------|---------------------|
| **OpenAI** | GPT-4o | 128K tokens | 16K tokens | tiktoken (o200k_base) |
| | GPT-4 Turbo | 128K tokens | 4K tokens | tiktoken (cl100k_base) |
| | GPT-4 | 32K tokens | 8K tokens | tiktoken (cl100k_base) |
| | GPT-3.5-turbo | 16K tokens | 4K tokens | tiktoken (cl100k_base) |
| **Anthropic** | Claude Sonnet 4.5 | 1M tokens (beta) | 64K tokens | Anthropic tokenizer (65K vocab, BPE) |
| | Claude 3.5 Sonnet | 200K tokens | 8K tokens (beta) | Anthropic tokenizer |
| | Claude 3 Opus | 200K tokens | 4K tokens | Anthropic tokenizer |
| | Claude 3 Haiku | 200K tokens | 4K tokens | Anthropic tokenizer |
| **Google** | Gemini 2.5 Pro | 1M tokens | 64K tokens | Gemini countTokens API |
| | Gemini 2.5 Flash | 1M tokens | 64K tokens | Gemini countTokens API |
| **Azure** | (Same as OpenAI) | (Same as OpenAI) | (Same as OpenAI) | tiktoken |

### Tokenization Methods

1. **OpenAI (tiktoken)**
   - Fast BPE (Byte Pair Encoding) tokenizer
   - Multiple encodings: `cl100k_base` (GPT-4), `o200k_base` (GPT-4o)
   - Available as npm package: `tiktoken`

2. **Anthropic Claude**
   - Custom BPE tokenizer with 65K vocabulary
   - R2L (Right-to-Left) number tokenization for better arithmetic
   - Official counting method: `countTokens` API endpoint
   - 70% vocabulary overlap with GPT-4's cl100k_base

3. **Google Gemini**
   - Multimodal tokenization (text, images, etc.)
   - Official method: `countTokens` API endpoint in Generative Language API

## Requirements

### 1. Automatic Compression (Auto-Summarization)

**User Story:**
As a user engaged in a long conversation, I want the system to automatically manage context size so that I can continue chatting without hitting token limits or experiencing errors.

**Functional Requirements:**

#### 1.1 Token Counting
- **FR-1.1.1**: The system SHALL calculate total token count of conversation history before each AI request
- **FR-1.1.2**: Token counting SHALL use provider-specific tokenization methods:
  - OpenAI: tiktoken library with appropriate encoding
  - Anthropic: Anthropic `countTokens` API
  - Google: Gemini `countTokens` API
- **FR-1.1.3**: Token count SHALL include:
  - User messages (all parts: text content)
  - Assistant messages (all parts: text content)
  - Tool invocations (JSON input and output)
  - Attachment metadata (filename, MIME type, size - but not content)
  - System messages (if any)
  - Current user input being sent
- **FR-1.1.4**: The system SHALL persist calculated token counts in `chatMessages.inputTokens` and `chatMessages.outputTokens` fields

#### 1.2 Compression Trigger
- **FR-1.2.1**: Compression SHALL trigger when total conversation token count exceeds a **configurable threshold percentage** of the model's context window
- **FR-1.2.2**: Default threshold SHALL be **95%** of context window
- **FR-1.2.3**: Threshold SHALL be configurable per provider/model in settings
- **FR-1.2.4**: The system SHALL reserve space for:
  - Current user input (estimated)
  - Expected AI response (using max output tokens)
  - Safety margin (5% by default)

#### 1.3 Message Retention Strategy
- **FR-1.3.1**: The system SHALL preserve recent messages based on a **configurable token count** rather than message count
- **FR-1.3.2**: Default token retention count SHALL be **1000 tokens**
- **FR-1.3.3**: Retention token count SHALL be configurable in settings
- **FR-1.3.4**: The system SHALL retain the maximum number of recent messages that fit within the retention token budget
  - Example: If retention budget is 1000 tokens, and the most recent 3 messages total 900 tokens while 4 messages total 1100 tokens, retain 3 messages
- **FR-1.3.5**: Messages older than the retention boundary SHALL be candidates for summarization

#### 1.4 Summarization Process
- **FR-1.4.1**: The system SHALL summarize messages older than the retention boundary into a single summary message
- **FR-1.4.2**: If a previous summary exists, the system SHALL include it in the summarization input along with messages since the last cutoff (multi-level compression)
- **FR-1.4.3**: Summary SHALL be generated by calling the AI model with a summarization prompt
- **FR-1.4.4**: Summarization prompt SHALL instruct the model to:
  - Preserve key facts, decisions, and context
  - Maintain chronological order of important events
  - Keep technical details and code examples when relevant
  - Include information about tool invocations and their results
  - Use concise language to maximize compression ratio
- **FR-1.4.5**: Generated summary SHALL be stored in `sessionSnapshots` table:
  - `kind`: 'summary'
  - `contentJson`: JSON-encoded summary content
  - `messageCutoffId`: ID of the last message included in summary
  - `tokenCount`: Token count of the summary
- **FR-1.4.6**: Original messages SHALL remain in database but be excluded from context retrieval when a summary exists

#### 1.5 Context Construction After Compression
- **FR-1.5.1**: When sending messages to AI provider, the system SHALL construct context as:
  1. Latest summary (if exists) as a system message
  2. Recent messages (within retention boundary)
  3. Current user input
- **FR-1.5.2**: Multiple summaries MAY exist if re-compression occurs
- **FR-1.5.3**: The system SHALL use the most recent summary covering the oldest messages

#### 1.6 User Notification
- **FR-1.6.1**: The system SHOULD display a non-intrusive notification when auto-compression occurs
- **FR-1.6.2**: Notification SHALL indicate:
  - Number of messages summarized
  - New context token count
- **FR-1.6.3**: User SHALL be able to view the summary content
- **FR-1.6.4**: User SHALL be able to disable notifications in settings

### 2. Manual Compression (User-Initiated Summarization)

**User Story:**
As a user, I want to manually compress conversation history at any time so that I can optimize context usage before starting a new topic or when I feel the conversation is getting too long.

**Functional Requirements:**

#### 2.1 Manual Trigger
- **FR-2.1.1**: The system SHALL provide a UI action to manually trigger compression (e.g., button, menu item)
- **FR-2.1.2**: Manual compression SHALL be accessible from:
  - Chat session controls (toolbar, context menu)
  - Session settings/options
- **FR-2.1.3**: Manual compression action SHALL be clearly labeled (e.g., "Summarize Conversation History")

#### 2.2 Compression Scope
- **FR-2.2.1**: Manual compression SHALL summarize **all messages** in the current session by default
- **FR-2.2.2**: User MAY specify a custom retention count before compression (optional advanced feature)
- **FR-2.2.3**: If a summary already exists, manual compression SHALL:
  - Include the previous summary in the summarization input
  - Create a new comprehensive summary
  - Replace or archive the old summary

#### 2.3 User Confirmation
- **FR-2.3.1**: The system SHALL display a confirmation dialog before manual compression
- **FR-2.3.2**: Confirmation dialog SHALL show:
  - Current total message count
  - Number of messages to be summarized
  - Estimated new token count (if calculable)
- **FR-2.3.3**: User SHALL be able to cancel the operation

#### 2.4 Summarization Process
- **FR-2.4.1**: Manual summarization SHALL follow the same process as automatic compression (FR-1.4)
- **FR-2.4.2**: User SHALL see a progress indicator during summarization
- **FR-2.4.3**: User SHALL be notified upon completion with:
  - Success/failure status
  - Summary preview (first 200 characters)
  - Token count reduction achieved

#### 2.5 Post-Compression State
- **FR-2.5.1**: After manual compression, subsequent AI requests SHALL use the compressed context
- **FR-2.5.2**: User SHALL be able to view the full summary at any time
- **FR-2.5.3**: Original messages SHALL remain accessible (e.g., via "View Full History" action)

### 3. Configuration and Settings

**Functional Requirements:**

#### 3.1 Compression Settings
- **FR-3.1.1**: The system SHALL provide configuration options for:
  - Auto-compression enabled/disabled (per session or global)
  - Compression threshold percentage (per model)
  - Retention token count (how many tokens of recent messages to preserve)
  - Notification preferences
- **FR-3.1.2**: Settings SHALL be persisted in the database (`settings` table)
- **FR-3.1.3**: Settings SHALL be accessible via Settings UI page

#### 3.2 Model-Specific Configuration
- **FR-3.2.1**: The system SHALL maintain a configuration map for each supported model containing:
  - Context window size (tokens)
  - Maximum output tokens
  - Tokenization method
  - Default compression threshold
  - Default retention token count
- **FR-3.2.2**: Configuration SHALL be updateable as new models are released

#### 3.3 Tokenization Library Management
- **FR-3.3.1**: The system SHALL include appropriate tokenization libraries:
  - `tiktoken` for OpenAI models
  - Anthropic SDK for Claude models (with `countTokens` API)
  - Google SDK for Gemini models (with `countTokens` API)
- **FR-3.3.2**: The system SHALL handle tokenization errors gracefully (e.g., fallback to approximate counting)

### 4. Data Model and Persistence

**Functional Requirements:**

#### 4.1 Database Schema Updates
- **FR-4.1.1**: `chatMessages` table SHALL utilize existing token fields:
  - `inputTokens`: Store input token count per message
  - `outputTokens`: Store output token count per message
- **FR-4.1.2**: `sessionSnapshots` table SHALL be used for storing summaries:
  - `kind` = 'summary' for compression summaries
  - `contentJson`: JSON object containing summary text and metadata
  - `messageCutoffId`: Reference to last message included in summary
  - `tokenCount`: Token count of the summary content
- **FR-4.1.3**: A new field MAY be added to `chatMessages` if needed:
  - `isSummarized`: Boolean flag indicating if message is part of a summary (optional)

#### 4.2 Summary Content Format
- **FR-4.2.1**: Summary `contentJson` SHALL follow this structure:
  ```json
  {
    "summaryText": "Comprehensive summary of conversation...",
    "messageRange": {
      "firstMessageId": "uuid-1",
      "lastMessageId": "uuid-2"
    },
    "compressionTimestamp": "2025-11-16T10:30:00Z",
    "compressionType": "auto" | "manual",
    "originalTokenCount": 50000,
    "summaryTokenCount": 2000,
    "messagesIncluded": 45
  }
  ```

#### 4.3 Query Optimization
- **FR-4.3.1**: The system SHALL efficiently query messages for context construction:
  - Fetch latest summary (if exists)
  - Fetch N most recent messages (where N is retention count)
  - Exclude messages older than summary cutoff
- **FR-4.3.2**: Database indexes SHALL be optimized for timestamp-based queries

### 5. Error Handling and Edge Cases

**Functional Requirements:**

#### 5.1 Summarization Failures
- **FR-5.1.1**: If automatic summarization fails, the system SHALL:
  - Log the error with full context
  - Fall back to sending full conversation history (may result in AI provider error)
  - Retry summarization on next request (with exponential backoff)
- **FR-5.1.2**: If manual summarization fails, the system SHALL:
  - Display error message to user
  - Provide option to retry
  - Allow user to continue without summarization

#### 5.2 Token Counting Failures
- **FR-5.2.1**: If token counting fails, the system SHALL:
  - Log the error
  - Use approximate counting (e.g., character count / 4 for English text)
  - Proceed with more conservative compression threshold

#### 5.3 Insufficient Context After Compression
- **FR-5.3.1**: If summary + retained messages still exceed context limit, the system SHALL:
  - Reduce retention count temporarily
  - Re-summarize with higher compression ratio
  - Warn user if context is critically limited

#### 5.4 Insufficient Context for Compression
- **FR-5.4.1**: The system SHALL NOT trigger compression if total conversation token count is below a minimum threshold (e.g., 2000 tokens)
- **FR-5.4.2**: Manual compression SHALL be allowed even with low token count (with warning)

### 6. User Experience and UI

**Functional Requirements:**

#### 6.1 Visual Indicators
- **FR-6.1.1**: The system SHALL display current session context usage:
  - Token count bar or percentage indicator
  - Visual warning when approaching threshold (e.g., orange at 80%, red at 95%)
- **FR-6.1.2**: Chat UI SHALL indicate when a summary is present:
  - Collapsible "Summary" section at top of message list
  - Badge or icon showing summarized message count

#### 6.2 Summary Viewing
- **FR-6.2.1**: User SHALL be able to view summaries inline in the chat interface
- **FR-6.2.2**: Summaries SHALL be visually distinct from regular messages (e.g., different background color)
- **FR-6.2.3**: User SHALL be able to expand/collapse summaries

#### 6.3 History Access
- **FR-6.3.1**: User SHALL be able to view full uncompressed history:
  - Via "View Full History" action
  - In a modal or separate view
  - With clear indication that this is not active context
- **FR-6.3.2**: User SHALL be able to search within full history

### 7. Performance and Scalability

**Non-Functional Requirements:**

- **NFR-7.1**: Token counting SHALL complete in < 500ms for conversations up to 1000 messages
- **NFR-7.2**: Summarization SHALL complete in < 10 seconds for conversations up to 1000 messages
- **NFR-7.3**: Context construction SHALL complete in < 100ms
- **NFR-7.4**: Database queries for message retrieval SHALL be optimized with indexes
- **NFR-7.5**: Token counting SHALL be performed asynchronously to avoid blocking UI

## Open Questions and Considerations

### 1. Summarization Prompt Design
**Question:** What is the optimal prompt for generating summaries?
**Considerations:**
- Should summaries be in first person ("I discussed...") or third person ("The user and assistant discussed...")?
- Should summaries preserve code snippets verbatim or describe them?
- Should summaries preserve tool invocations and results?

**Proposed Approach:**
- Create multiple prompt templates for different conversation types (technical, general, coding)
- Allow users to customize summarization style (detailed vs. concise)
- A/B test different prompts to measure compression ratio vs. context retention

### 2. Multi-Step Compression Strategy ✅ RESOLVED
**Decision:** Multi-level compression is REQUIRED. When a second compression is needed, the system SHALL include the previous summary plus subsequent messages as input for the new summary. This creates a cascading summary chain without depth limits.

### 3. Token Counting for Tool Calls and Attachments ✅ RESOLVED
**Decision:**
- Tool invocations: Count tokens by tokenizing JSON input and output using the model's tokenization method
- Attachments: Count metadata only (filename, MIME type, size in bytes) - not the actual content
- This aligns with how providers actually count tokens for these elements

### 4. Summarization Model Selection
**Question:** Which model should generate the summary?
**Considerations:**
- Using the same model ensures consistency but may be expensive
- Using a cheaper model (e.g., GPT-3.5-turbo, Claude Haiku) saves cost
- Summarization quality varies by model

**Proposed Approach:**
- Default to using a "summarization model" per provider:
  - OpenAI: GPT-4o-mini
  - Anthropic: Claude 3 Haiku
  - Google: Gemini 2.5 Flash
- Allow advanced users to configure summarization model
- Measure quality vs. cost tradeoff in testing

### 5. User Control and Override ✅ RESOLVED
**Decision:** Message pinning is NOT in scope for the current implementation. This feature will not be developed at this time.

### 6. Summarization Transparency
**Question:** How much visibility should users have into the summarization process?
**Considerations:**
- Users may want to see what was summarized
- Users may want to edit or regenerate summaries
- Too much complexity may confuse users

**Proposed Approach:**
- Provide transparency features:
  - Show before/after token counts
  - Display summary preview
  - Allow viewing original messages
  - Provide "Regenerate Summary" option
- Keep advanced features behind settings/advanced mode

### 7. Cross-Session Context
**Question:** Should summaries from one session be usable in another?
**Considerations:**
- Users may want to continue a topic in a new session
- Cross-session context could improve continuity
- Increases complexity and potential for context pollution

**Proposed Approach (Future Enhancement):**
- Phase 1: Summaries are session-scoped only
- Phase 2: Allow users to "import" summaries from other sessions
- Phase 3: AI-powered session linking and context merging

## Implementation Phases

### Phase 1: Foundation (MVP)
**Scope:**
- Token counting for OpenAI models (tiktoken)
- Automatic compression with fixed threshold (95%)
- Basic summarization using current model
- Summary storage in database
- Simple UI notification

**Deliverables:**
- Working auto-compression for OpenAI
- Database schema utilizing existing fields
- Basic settings configuration

### Phase 2: Multi-Provider Support
**Scope:**
- Token counting for Anthropic (countTokens API)
- Token counting for Google Gemini (countTokens API)
- Provider-specific configuration
- Configurable compression thresholds

**Deliverables:**
- Full provider support
- Model-specific configuration map
- Enhanced error handling

### Phase 3: Manual Compression and UX
**Scope:**
- Manual compression UI
- Summary viewing interface
- Token usage visualization
- Full history access

**Deliverables:**
- Complete UI for compression management
- User-friendly controls and indicators
- Documentation and help text

### Phase 4: Advanced Features (Future)
**Scope:**
- Message pinning
- Custom summarization prompts
- Multi-level summarization
- Cross-session context
- Summarization quality metrics

**Deliverables:**
- Advanced user controls
- Optimization and tuning tools
- Analytics and insights

## Success Metrics

### Technical Metrics
- **Token counting accuracy**: > 95% match with provider's actual token count
- **Compression ratio**: Average 10:1 reduction in token count
- **Summarization latency**: < 10 seconds for 1000 messages
- **Context retrieval performance**: < 100ms

### User Experience Metrics
- **Auto-compression success rate**: > 99% (failures should be rare)
- **User satisfaction with summaries**: Qualitative feedback
- **Context overflow errors**: Reduced by > 90% compared to no compression
- **Average conversation length**: Increase in messages per session

## References

### External Documentation
- [OpenAI Tokenization (tiktoken)](https://github.com/openai/tiktoken)
- [Anthropic Token Counting](https://docs.anthropic.com/en/docs/about-claude/models)
- [Google Gemini Token Counting](https://ai.google.dev/gemini-api/docs/models)
- [AI SDK Documentation](https://sdk.vercel.ai/docs)

### Internal Documentation
- [Database Schema](../src/backend/db/schema.ts)
- [Chat Session Store](../src/backend/session/ChatSessionStore.ts)
- [AI Provider Factory](../src/backend/ai/factory.ts)
- [AI Streaming Implementation](../src/backend/ai/stream.ts)

## Appendix A: Token Counting Implementation Examples

### OpenAI (tiktoken)
```typescript
import { encoding_for_model } from 'tiktoken';

function countTokensOpenAI(text: string, model: string): number {
  const encoding = encoding_for_model(model);
  const tokens = encoding.encode(text);
  encoding.free();
  return tokens.length;
}
```

### Anthropic (API-based)
```typescript
import Anthropic from '@anthropic-ai/sdk';

async function countTokensAnthropic(messages: any[]): Promise<number> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.countTokens({
    model: 'claude-3-5-sonnet-20241022',
    messages: messages,
  });
  return response.input_tokens;
}
```

### Google Gemini (API-based)
```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

async function countTokensGemini(text: string): Promise<number> {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const result = await model.countTokens(text);
  return result.totalTokens;
}
```

## Appendix B: Summarization Prompt Template

### Default Summarization Prompt
```
You are a conversation summarization assistant. Your task is to create a concise yet comprehensive summary of the conversation history provided below.

**Guidelines:**
1. Preserve all key facts, decisions, and important context
2. Maintain chronological order of significant events
3. Keep technical details, code examples, and specific implementation decisions
4. Use concise language to maximize information density
5. Focus on actionable information and outcomes
6. Omit pleasantries, greetings, and off-topic discussions

**Conversation History:**
{conversation_history}

**Summary:**
Please provide a summary in the following format:

## Context
[Brief overview of the main topic and purpose of the conversation]

## Key Points
- [Important fact/decision 1]
- [Important fact/decision 2]
...

## Technical Details
[Code snippets, commands, configurations, or technical specifications discussed]

## Decisions and Outcomes
[Agreements reached, decisions made, next steps identified]

## Unresolved Questions
[Any open questions or pending items]
```

### Code-Focused Summarization Prompt
```
Summarize the following programming conversation. Focus on:
- Problem being solved
- Code changes made (with brief snippets if critical)
- Technical decisions and rationale
- Bugs identified and fixes applied
- Next steps or TODO items

Conversation:
{conversation_history}
```

---

**Document Version:** 1.1
**Last Updated:** 2025-11-16
**Author:** Claude Code Agent
**Status:** Requirements Clarified - Ready for Implementation
