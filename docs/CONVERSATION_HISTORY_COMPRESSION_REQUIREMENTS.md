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
| **OpenAI** | GPT-5 | 400K tokens | 128K tokens | tiktoken (o200k_base) |
| | GPT-4o | 128K tokens | 16K tokens | tiktoken (o200k_base) |
| | GPT-4o-mini | 128K tokens | 16K tokens | tiktoken (o200k_base) |
| | GPT-4 Turbo | 128K tokens | 4K tokens | tiktoken (cl100k_base) |
| **Anthropic** | Claude Sonnet 4.5 | 200K tokens (1M beta) | 64K tokens | Anthropic tokenizer (65K vocab, BPE) |
| | Claude Opus 4.1 | 200K tokens | 4K tokens | Anthropic tokenizer |
| | Claude Haiku 4.5 | 200K tokens | 64K tokens | Anthropic tokenizer |
| | Claude 3.5 Sonnet | 200K tokens | 8K tokens | Anthropic tokenizer (legacy) |
| | Claude 3 Opus | 200K tokens | 4K tokens | Anthropic tokenizer (legacy) |
| | Claude 3 Haiku | 200K tokens | 4K tokens | Anthropic tokenizer (legacy) |
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
- **FR-1.1.1**: The system MUST calculate total token count of conversation history before each AI request
- **FR-1.1.2**: Token counting MUST be performed **locally** for all compression decisions:
  - All message token counts MUST be calculated locally before sending requests to AI providers
  - This is essential because token counts are needed before sending requests (to determine if compression is needed)
  - API response token counts are cumulative and cannot be used to calculate individual message sizes
- **FR-1.1.3**: The system SHOULD use tiktoken with `o200k_base` encoding as the tokenizer
  - Alternative tokenizers MAY be used if they provide comparable or better accuracy
  - The tokenizer choice SHOULD be documented in implementation
- **FR-1.1.4**: Token count MUST include:
  - User messages (all parts: text content)
  - Assistant messages (all parts: text content)
  - Tool invocations (JSON input and output, serialized then tokenized)
  - Attachment metadata (filename, MIME type, size - but not content)
  - System messages (if any)
  - Current user input being sent
- **FR-1.1.5**: The system MAY persist token counts from AI responses in `chatMessages.inputTokens` and `chatMessages.outputTokens` fields for monitoring and analytics purposes
  - These recorded values MUST NOT be used for compression decision-making
  - They serve only as reference data for performance monitoring

#### 1.2 Compression Trigger
- **FR-1.2.1**: Compression MUST trigger automatically when total conversation token count exceeds a **configurable threshold percentage** of the model's context window
- **FR-1.2.2**: Default threshold SHOULD be **95%** of context window (models MAY have specific defaults defined in FR-3.2.1)
- **FR-1.2.3**: Threshold MUST be configurable per provider/model in settings
- **FR-1.2.4**: The system MUST reserve space for:
  - Current user input (estimated)
  - Expected AI response (using max output tokens)
  - Safety margin (5% by default)

#### 1.3 Message Retention Strategy
- **FR-1.3.1**: The system MUST preserve recent messages based on a **configurable token count** rather than message count
- **FR-1.3.2**: Default token retention count SHOULD be **1000 tokens**
- **FR-1.3.3**: The system MUST retain the maximum number of recent messages that fit within the retention token budget
  - Example: If retention budget is 1000 tokens, and the most recent 3 messages total 900 tokens while 4 messages total 1100 tokens, retain 3 messages
- **FR-1.3.4**: Messages older than the retention boundary MUST be candidates for summarization

#### 1.4 Summarization Process
- **FR-1.4.1**: The system MUST summarize messages older than the retention boundary into a single summary message
- **FR-1.4.2**: If a previous summary exists, the system MUST include it in the summarization input along with messages since the last cutoff (multi-level compression)
- **FR-1.4.3**: Summary MUST be generated by calling the AI model with a summarization prompt
- **FR-1.4.4**: Summarization prompt MUST instruct the model to:
  - Preserve key facts, decisions, and context
  - Maintain chronological order of important events
  - Keep technical details and code examples when relevant
  - Include information about tool invocations and their results
  - Use concise language to maximize compression ratio
- **FR-1.4.5**: Generated summary MUST be stored in `sessionSnapshots` table:
  - `kind`: 'summary'
  - `contentJson`: JSON-encoded summary content
  - `messageCutoffId`: ID of the last message included in summary
  - `tokenCount`: Token count of the summary
- **FR-1.4.6**: Original messages MUST remain in database but be excluded from context retrieval when a summary exists

#### 1.5 Context Construction After Compression
- **FR-1.5.1**: When sending messages to AI provider, the system MUST construct context as:
  1. Latest summary (if exists) as a system message
  2. Recent messages (within retention boundary)
  3. Current user input
- **FR-1.5.2**: Multiple summaries MAY exist if re-compression occurs
- **FR-1.5.3**: The system MUST use the most recent summary covering the oldest messages

#### 1.6 User Notification
- **FR-1.6.1**: The system SHOULD display a non-intrusive notification when compression is in progress (both auto and manual)
- **FR-1.6.2**: Notification SHOULD indicate:
  - That summarization is occurring
  - Approximate scope (e.g., "Summarizing 45 messages...")
- **FR-1.6.3**: User MAY be able to view the summary content after completion
- **FR-1.6.4**: User MAY be able to disable notifications in settings

### 2. Manual Compression (User-Initiated Summarization)

**User Story:**
As a user, I want to manually compress conversation history at any time so that I can optimize context usage before starting a new topic or when I feel the conversation is getting too long.

**Functional Requirements:**

#### 2.1 Manual Trigger
- **FR-2.1.1**: The system MUST provide a UI action to manually trigger compression (e.g., button, menu item, slash command)
- **FR-2.1.2**: Manual compression SHOULD be accessible from:
  - Chat session controls (toolbar, context menu)
  - Session settings/options
  - Slash command in chat input (e.g., `/summarize`)
- **FR-2.1.3**: Manual compression action MUST be clearly labeled (e.g., "Summarize Conversation History" for buttons/menus, `/summarize` for slash commands)

#### 2.2 Compression Scope
- **FR-2.2.1**: Manual compression MUST summarize messages according to the same retention token budget as automatic compression
- **FR-2.2.2**: User MAY specify a custom retention count before compression (optional advanced feature)
- **FR-2.2.3**: If a summary already exists, manual compression MUST:
  - Include the previous summary in the summarization input
  - Create a new comprehensive summary
  - Replace the old summary with the new one

#### 2.3 Summarization Process
- **FR-2.3.1**: Manual summarization MUST follow the same process as automatic compression
- **FR-2.3.2**: User SHOULD see a notification indicating summarization is in progress
- **FR-2.3.3**: User SHOULD be notified upon completion

#### 2.4 Post-Compression Behavior
- **FR-2.4.1**: After compression (both manual and automatic), the compressed context MUST be used for all subsequent AI requests
- **FR-2.4.2**: The handling of summarized context MUST be identical whether compression was triggered automatically or manually

### 3. Configuration and Settings

**Functional Requirements:**

#### 3.1 Compression Settings
- **FR-3.1.1**: The system MUST provide configuration options for:
  - Compression threshold percentage per provider/model (see FR-1.2.3)
  - Retention token count (how many tokens of recent messages to preserve)
  - Notification preferences
- **FR-3.1.2**: Settings MUST be persisted in the database (`settings` table)
- **FR-3.1.3**: Settings SHOULD be accessible via Settings UI page

**Note:** Auto-compression cannot be disabled as it is essential for continued operation when approaching context limits.

#### 3.2 Model-Specific Configuration

- **FR-3.2.1**: The system MUST maintain model configuration in the database (not hardcoded) for each model, including:
  - **Maximum input tokens** (the maximum number of tokens that can be sent as input context)
  - Maximum output tokens
  - Default compression threshold percentage
  - Default retention token count

- **FR-3.2.2**: When a new model is detected (e.g., from AI provider API or user selection), the system SHOULD:
  - Attempt to retrieve maximum input tokens from API metadata or model information
  - If retrieval fails or information is unavailable, use a conservative default (128,000 tokens for input)
  - Store the configuration in the database
  - Allow user to modify the configuration later via Settings UI

- **FR-3.2.3**: For custom/manually added models, the system MUST:
  - Prompt user to specify maximum input tokens (with 128,000 token default suggestion)
  - Allow user to configure all compression-related settings
  - Store configuration in database

- **FR-3.2.4**: The system MUST provide UI for users to:
  - View current model configurations (maximum input tokens, output tokens, thresholds)
  - Edit maximum input tokens and other compression settings per model
  - Reset to detected/default values if needed

- **FR-3.2.5**: Model configuration updates MUST be persisted in the database and applied immediately to compression decisions

**Note:** "Maximum input tokens" is the critical value for compression decisions. It represents how many tokens can be sent to the model as input context, and is calculated as: `total context window - max output tokens` (if both values are known from API).

#### 3.3 Tokenization Library Management
- **FR-3.3.1**: The system MUST handle tokenization errors according to FR-5.2.1 (display error and allow retry; no fallback methods)

**Note:** Tokenizer selection is specified in FR-1.1.3.

### 4. Data Model and Persistence

**Functional Requirements:**

#### 4.1 Database Schema Updates
- **FR-4.1.1**: `chatMessages` table MUST utilize existing token fields:
  - `inputTokens`: Store input token count per message
  - `outputTokens`: Store output token count per message
- **FR-4.1.2**: `sessionSnapshots` table MUST be used for storing summaries:
  - `kind` = 'summary' for compression summaries
  - `contentJson`: JSON object containing summary text and metadata
  - `messageCutoffId`: Reference to last message included in summary
  - `tokenCount`: Token count of the summary content
- **FR-4.1.3**: A new `modelConfigs` table MUST be created to store model configurations:
  - `id`: Primary key (format: "provider:model")
  - `provider`: AI provider name (openai, anthropic, google, azure)
  - `model`: Model name
  - `maxInputTokens`: Maximum input context tokens
  - `maxOutputTokens`: Maximum response tokens
  - `defaultCompressionThreshold`: Default threshold percentage (0-1)
  - `recommendedRetentionTokens`: Default retention token count
  - `source`: Configuration source ('api' | 'manual' | 'default')
  - `lastUpdated`: Timestamp of last update
  - `createdAt`: Creation timestamp
- **FR-4.1.4**: A new field MAY be added to `chatMessages` if needed:
  - `isSummarized`: Boolean flag indicating if message is part of a summary (optional)

#### 4.2 Summary Content Format
- **FR-4.2.1**: Summary `contentJson` MUST contain:
  - `summaryText`: The generated summary text
  - `messageRange`: Object tracking first and last message IDs included in the summary

  Additional metadata (compression timestamp, type, token counts, etc.) MAY be included as implementation details.

#### 4.3 Query Optimization
- **FR-4.3.1**: The system MUST efficiently query messages for context construction:
  - Fetch latest summary (if exists)
  - Fetch N most recent messages (where N is retention count)
  - Exclude messages older than summary cutoff
- **FR-4.3.2**: Database indexes SHOULD be optimized for timestamp-based queries

### 5. Error Handling and Edge Cases

**Functional Requirements:**

#### 5.1 Summarization Failures
- **FR-5.1.1**: If automatic summarization fails, the system MUST:
  - Log the error with full context
  - Display error notification to user
  - Provide option to retry summarization manually
  - NOT proceed with sending full conversation history (would likely exceed context limits)
  - Prevent further AI requests until compression succeeds or user acknowledges the risk
- **FR-5.1.2**: If manual summarization fails, the system MUST:
  - Display error message to user
  - Provide option to retry
  - Allow user to continue at their own risk (with warning about potential context limit issues)

#### 5.2 Token Counting Failures
- **FR-5.2.1**: If token counting fails, the system MUST:
  - Log the error with full context
  - Display error message to user
  - Provide option to retry token counting
  - NOT proceed with fallback counting methods (no approximate counting)

#### 5.3 Insufficient Context After Compression
- **FR-5.3.1**: If summary + retained messages still exceed context limit, the system SHOULD:
  - Reduce retention count temporarily
  - Re-summarize with higher compression ratio
  - Warn user if context is critically limited

#### 5.4 Insufficient Context for Compression
- **FR-5.4.1**: The system MUST NOT trigger compression if total conversation token count is below a minimum threshold (e.g., 2000 tokens)
- **FR-5.4.2**: Manual compression SHOULD be allowed even with low token count (with warning)

### 6. User Experience and UI

**Functional Requirements:**

#### 6.1 Visual Indicators
- **FR-6.1.1**: The system SHOULD display current session context usage:
  - Token count bar or percentage indicator
  - Visual warning when approaching threshold (e.g., orange at 80%, red at 95%)
- **FR-6.1.2**: Chat UI MAY indicate when a summary is present:
  - Collapsible "Summary" section at top of message list
  - Badge or icon showing summarized message count

#### 6.2 Summary Viewing
- **FR-6.2.1**: User MAY be able to view summaries inline in the chat interface
- **FR-6.2.2**: Summaries MAY be visually distinct from regular messages (e.g., different background color)
- **FR-6.2.3**: User MAY be able to expand/collapse summaries

#### 6.3 History Access
- **FR-6.3.1**: User MAY be able to view full uncompressed history:
  - Via "View Full History" action
  - In a modal or separate view
  - With clear indication that this is not active context
- **FR-6.3.2**: User MAY be able to search within full history

### 7. Performance and Scalability

**Non-Functional Requirements:**

- **NFR-7.1**: Token counting SHALL complete in < 500ms for conversations up to 100,000 tokens
- **NFR-7.2**: Context construction SHALL complete in < 100ms
- **NFR-7.3**: Database queries for message retrieval SHALL be optimized with indexes
- **NFR-7.4**: Token counting SHALL be performed asynchronously to avoid blocking UI

**Note:** Summarization performance depends on external AI provider and cannot be specified as a hard requirement.

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
- Tool invocations: Serialize JSON input/output, then count tokens using tiktoken o200k_base
- Attachments: Count metadata only (filename, MIME type, size in bytes) - not the actual content
- This provides consistent counting across all providers

**Implementation:** See `CONVERSATION_HISTORY_COMPRESSION_TOKEN_COUNTING_STRATEGY.md` for the hybrid approach design.

### 4. Summarization Model Selection
**Question:** Which model should generate the summary?
**Considerations:**
- Using the same model ensures consistency but may be expensive
- Using a cheaper model (e.g., GPT-3.5-turbo, Claude Haiku) saves cost
- Summarization quality varies by model

**Proposed Approach:**
- Default to using a "summarization model" per provider:
  - OpenAI: GPT-4o-mini
  - Anthropic: Claude Haiku 4.5
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

## Appendix A: Token Counting Implementation Example

### Local Token Counting with tiktoken (Recommended)
```typescript
import { get_encoding } from 'tiktoken';

function countTokens(text: string): number {
  // Use o200k_base encoding (recommended for all providers)
  const encoding = get_encoding('o200k_base');
  const tokens = encoding.encode(text);
  const count = tokens.length;
  encoding.free(); // Clean up resources
  return count;
}
```

**Note:** This provides ±10-15% accuracy for non-OpenAI models, which is acceptable given the 95% threshold and safety margins built into the compression system.

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

**Document Version:** 1.6
**Last Updated:** 2025-11-17
**Author:** Claude Code Agent
**Status:** Requirements Finalized - Ready for Implementation

**Changes in v1.6:**
- **FR-4.1.3**: Added new requirement for `modelConfigs` database table to store model configurations
  - Specifies schema for database-backed model configuration (aligns with FR-3.2.1)
  - Includes all necessary fields: maxInputTokens, maxOutputTokens, thresholds, source tracking, timestamps
- **FR-4.1.4**: Renumbered from FR-4.1.3 (optional isSummarized field)
- **Alignment**: This change ensures database schema requirements match the model configuration approach defined in FR-3.2

**Changes in v1.5:**
- **FR-1.1.2**: Removed hybrid approach; token counting MUST always be performed locally
- **FR-1.1.3**: Changed tiktoken o200k_base from MAY to SHOULD (recommended but not mandatory)
- **FR-1.1.4**: Renumbered from FR-1.1.3 (token count inclusion requirements)
- **FR-1.1.5**: API response token counts are now MAY (for monitoring only, not compression decisions)
- **FR-1.2.2**: Changed from MUST to SHOULD (default value is a recommendation); added note about model-specific defaults
- **FR-1.2.3**: Changed from SHOULD to MUST (configurability is required)
- **FR-1.3.2**: Changed from MUST to SHOULD (default value is a recommendation)
- **FR-1.3.3**: Deleted (merged into FR-3.1.1 to eliminate duplication)
- **FR-1.3.4-1.3.5**: Renumbered from FR-1.3.5-1.3.6 due to FR-1.3.3 deletion
- **FR-2.1.1**: Added slash command as an example of UI action
- **FR-2.1.2**: Added slash command (`/summarize`) as an accessibility option
- **FR-2.1.3**: Added slash command labeling example
- **FR-3.1.1**: Changed from SHOULD to MUST; added reference to FR-1.2.3 for threshold configuration
- **FR-3.2.1 Note**: Removed (redundant after hybrid approach removal)
- **FR-3.3.1**: Replaced tokenizer selection requirement with error handling only (tokenizer selection moved to FR-1.1.3 to eliminate duplication)
- **FR-3.3.1 Note**: Added reference to FR-1.1.3 for tokenizer selection
- **FR-5.1.1**: Removed dangerous fallback (sending full conversation history); added user notification and manual retry option; prevent further AI requests until resolved
- **FR-5.1.2**: Updated to clarify user continues at own risk with warning
- **Appendix A**: Removed provider-specific API examples; kept only local tiktoken example
- **Rationale**: API response token counts are cumulative and unavailable before sending requests, making them unsuitable for compression decisions
- **Consistency improvements**: Aligned modal verbs (MUST/SHOULD/MAY) across related requirements; eliminated duplicate definitions; removed unsafe fallback behaviors

**Changes in v1.4:**
- **FR-4.2.1**: Simplified summary content format to essential fields only (summaryText + messageRange)
- **FR-5.2.1**: Removed fallback counting methods; token counting failures now require user retry
- **FR-6.1.2**: Downgraded summary presence indicators from SHOULD to MAY
- **FR-6.2.1-6.2.3**: Downgraded summary viewing features from SHOULD to MAY
- **NFR-7.1**: Changed performance criteria from message count to token count (100K tokens)
- **NFR-7.2**: Removed summarization performance requirement (external dependency)
- Renumbered NFR-7.x to reflect deletion

**Changes in v1.3:**
- Changed modal verbs from SHALL to MUST/SHOULD/MAY per RFC 2119
- Removed FR-2.3 (user confirmation dialog for manual compression) - over-engineered
- Updated FR-2.4.2: Changed from progress percentage to simple notification
- Removed FR-2.4.3, FR-2.5.2, FR-2.5.3 - not essential for MVP
- Updated FR-2.4.1-2.4.2: Emphasized that auto and manual compression are handled identically
- Removed auto-compression disable option from FR-3.1.1 - not practical
- Changed FR-3.3.1 from SHALL to MAY - allows for future tokenizer alternatives
