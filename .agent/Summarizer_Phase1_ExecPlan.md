# Conversation History Compression - Phase 1: Backend Implementation

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `.agent/PLANS.md` from the repository root.


## Purpose / Big Picture

This Phase 1 implementation delivers the backend infrastructure for automatic conversation history compression in an Electron AI chat application. After this phase, the system will be able to count tokens in conversations, manage model-specific configurations in a database, generate summaries of old messages using AI, and compress conversation history by replacing old messages with summaries while retaining recent messages.

The user will not see UI changes in this phase, but the backend will be fully functional and testable via unit tests. A developer can run tests to verify that token counting works, model configurations are stored and retrieved from the database, conversations can be summarized, and compression reduces token count while preserving information.


## Progress

Use timestamps to track progress. Update this section at every stopping point.

- [ ] Milestone 1: Database schema and model configuration service
  - [ ] Add modelConfigs table to database schema
  - [ ] Implement ModelConfigService with database operations
  - [ ] Create database migration
  - [ ] Implement seed data loading
  - [ ] Write unit tests for ModelConfigService

- [ ] Milestone 2: Token counting implementation
  - [ ] Install tiktoken dependency
  - [ ] Implement TokenCounter service
  - [ ] Write unit tests for TokenCounter
  - [ ] Verify token counting accuracy

- [ ] Milestone 3: Summarization service
  - [ ] Implement SummarizationService
  - [ ] Create summarization prompt template
  - [ ] Write unit tests for SummarizationService
  - [ ] Test with different providers (OpenAI, Anthropic, Google)

- [ ] Milestone 4: Database extensions for compression
  - [ ] Add methods to ChatSessionStore for snapshots
  - [ ] Add buildAIContext method
  - [ ] Write unit tests for new ChatSessionStore methods

- [ ] Milestone 5: Core compression service
  - [ ] Implement CompressionService
  - [ ] Implement checkContext method
  - [ ] Implement autoCompress method
  - [ ] Implement manualCompress method
  - [ ] Write comprehensive unit tests

- [ ] Milestone 6: Integration testing
  - [ ] Write integration tests for full compression flow
  - [ ] Test multi-level compression (re-compression)
  - [ ] Test error handling scenarios
  - [ ] Performance validation


## Surprises & Discoveries

Document unexpected behaviors, bugs, optimizations, or insights discovered during implementation.

(To be filled during implementation)


## Decision Log

Record every decision made while working on the plan.

(To be filled during implementation)


## Outcomes & Retrospective

(To be filled at completion of major milestones)


## Context and Orientation

This is an Electron application using a three-process architecture (main, backend, renderer). The backend process (`src/backend/`) handles business logic including AI interactions, database operations, and now conversation history compression.

**Existing infrastructure:**
- Database: SQLite with Drizzle ORM, schema in `src/backend/db/schema.ts`
- Migrations: Located in `resources/db/migrations/`
- Chat sessions: Managed by `ChatSessionStore` in `src/backend/session/`
- AI providers: Factory pattern in `src/backend/ai/` supporting OpenAI, Anthropic, Google

**Key files:**
- `src/backend/db/schema.ts` - Database schema definitions using Drizzle ORM
- `src/backend/db/index.ts` - Database connection and initialization
- `src/backend/session/ChatSessionStore.ts` - Chat session management and persistence
- `src/backend/ai/factory.ts` - AI provider factory for multi-provider support

**Design documents:**
- `docs/CONVERSATION_HISTORY_COMPRESSION_REQUIREMENTS.md` (v1.6) - Functional requirements
- `docs/CONVERSATION_HISTORY_COMPRESSION_DESIGN.md` (v3.1) - Technical design
- `docs/CONVERSATION_HISTORY_COMPRESSION_TOKEN_COUNTING_STRATEGY.md` (v2.0) - Token counting rationale

**What we are building:**
Phase 1 creates five new backend services under `src/backend/compression/`:
1. `TokenCounter` - Counts tokens using tiktoken o200k_base encoding
2. `ModelConfigService` - Manages model configurations in database (maxInputTokens, thresholds, etc.)
3. `SummarizationService` - Generates summaries using AI providers
4. `CompressionService` - Orchestrates compression workflow (check context, compress, manage state)
5. Extensions to `ChatSessionStore` - New methods for snapshot management and context building

We will also add a `modelConfigs` table to the database schema.


## Plan of Work

The work proceeds in six milestones that build incrementally.


### Milestone 1: Database Schema and Model Configuration Service

**Goal:** Create the database foundation for storing model configurations and implement the service to manage them.

**What to build:**
1. Add `modelConfigs` table to `src/backend/db/schema.ts` with fields:
   - id (primary key, format "provider:model")
   - provider, model, maxInputTokens, maxOutputTokens
   - defaultCompressionThreshold, recommendedRetentionTokens
   - source ('api' | 'manual' | 'default'), lastUpdated, createdAt

2. Create migration file in `resources/db/migrations/` to create the table and index

3. Implement `src/backend/compression/ModelConfigService.ts` with methods:
   - getConfig(provider, model) - Retrieve from DB, auto-detect if missing
   - detectFromAPI(provider, model) - Attempt API metadata retrieval
   - saveConfig(config) - Insert or update configuration
   - getAllConfigs() - List all stored configurations
   - updateConfig(id, updates) - Partial update
   - deleteConfig(id) - Remove configuration

4. Create seed data function to populate known models (GPT-4o, Claude Sonnet 4.5, Gemini 2.5 Pro, etc.)

**Acceptance:**
- Run Drizzle migration and verify modelConfigs table exists in database
- Run unit tests for ModelConfigService
- Verify seed data populates on first run
- Query database manually: `sqlite3 ./tmp/db/app.db "SELECT * FROM modelConfigs"` shows seeded configurations


### Milestone 2: Token Counting Implementation

**Goal:** Implement fast, local token counting for all conversation messages.

**What to build:**
1. Install `tiktoken` npm package: `pnpm add tiktoken`

2. Implement `src/backend/compression/TokenCounter.ts` with methods:
   - constructor() - Initialize tiktoken o200k_base encoding
   - countMessageTokens(message) - Count single message
   - countConversationTokens(messages) - Count array with categorization
   - countText(text) - Count raw text
   - dispose() - Clean up encoding resources

3. Handle all message part types:
   - Text parts: encode and count
   - Tool invocations: serialize JSON, then count
   - Tool results: serialize JSON, then count
   - Attachments: count metadata only (filename, MIME type)

4. Include message overhead (4 tokens per message for role + formatting)

**Acceptance:**
- Run unit tests for TokenCounter
- Verify token counts are consistent across multiple runs
- Test with sample messages containing text, tool calls, and attachments
- Verify dispose() releases tiktoken resources without errors


### Milestone 3: Summarization Service

**Goal:** Generate concise summaries of conversation history using AI providers.

**What to build:**
1. Implement `src/backend/compression/SummarizationService.ts` with methods:
   - summarize(options) - Main entry point
   - getSummarizationPrompt(conversationText) - Prompt template
   - selectSummarizationModel(provider) - Choose faster/cheaper models

2. Summarization prompt must instruct AI to:
   - Preserve key facts, decisions, and context
   - Maintain chronological order
   - Keep technical details and code examples
   - Include tool invocation information
   - Use concise language for compression

3. Use cheaper models for summarization:
   - OpenAI: gpt-4o-mini
   - Anthropic: claude-haiku-4-5
   - Google: gemini-2.5-flash

4. Handle errors gracefully (throw descriptive errors, log context)

**Acceptance:**
- Run unit tests for SummarizationService
- Mock AI provider calls to verify prompt construction
- Test with real AI providers (requires API keys in environment)
- Verify summaries are significantly shorter than original (at least 50% reduction)
- Verify summaries preserve key information from test conversations


### Milestone 4: Database Extensions for Compression

**Goal:** Add methods to ChatSessionStore for managing compression snapshots and building AI context.

**What to build:**
1. Extend `src/backend/session/ChatSessionStore.ts` with new methods:
   - createSnapshot(params) - Create summary snapshot in sessionSnapshots table
   - getLatestSnapshot(sessionId, kind) - Retrieve most recent snapshot
   - getSnapshots(sessionId) - Get all snapshots for session
   - updateMessageTokens(messageId, inputTokens, outputTokens) - Update token counts
   - buildAIContext(sessionId) - Construct context with summary + recent messages

2. Update existing schema if needed to ensure sessionSnapshots table supports:
   - kind: 'summary'
   - contentJson: JSON-encoded summary data
   - messageCutoffId: Last message included in summary
   - tokenCount: Summary token count

**Acceptance:**
- Run unit tests for new ChatSessionStore methods
- Create test session, add messages, create snapshot
- Verify buildAIContext returns summary + messages after cutoff
- Verify getLatestSnapshot retrieves correct snapshot
- Test with multiple snapshots (re-compression scenario)


### Milestone 5: Core Compression Service

**Goal:** Implement the orchestrator that ties everything together.

**What to build:**
1. Implement `src/backend/compression/CompressionService.ts` with constructor dependencies:
   - TokenCounter
   - SummarizationService
   - ChatSessionStore
   - ModelConfigService

2. Implement checkContext(sessionId, provider, model, additionalInput):
   - Get model config from ModelConfigService
   - Fetch session messages from ChatSessionStore
   - Get latest summary if exists
   - Build current context (summary + messages after cutoff)
   - Count tokens using TokenCounter
   - Calculate available space (maxInputTokens - safety margin)
   - Determine if compression needed (token count > threshold)
   - Calculate retention boundary based on token budget
   - Return ContextCheckResult

3. Implement autoCompress(options):
   - Get model config
   - Fetch session messages
   - Determine retention boundary (recent N tokens to keep)
   - Split messages: to-compress vs. to-retain
   - Include previous summary if exists (multi-level compression)
   - Generate summary via SummarizationService
   - Count summary tokens
   - Store snapshot in database
   - Return CompressionResult

4. Implement manualCompress(options):
   - Similar to autoCompress but force=true ignores threshold
   - Compress all messages except retention boundary

**Acceptance:**
- Run comprehensive unit tests for CompressionService
- Test checkContext with various session sizes
- Test autoCompress creates summary and reduces token count
- Test multi-level compression (compress, add messages, compress again)
- Verify compression ratio (summary < 30% of original token count)
- Verify retention boundary logic (recent messages preserved)


### Milestone 6: Integration Testing

**Goal:** Validate the complete compression flow end-to-end.

**What to build:**
1. Write integration tests in `src/backend/compression/__tests__/integration.test.ts`:
   - Full compression workflow (create session, add many messages, compress, verify)
   - Multi-level compression (compress multiple times, verify summary chaining)
   - Error handling (summarization failures, token counting failures)
   - Performance (compress 100K tokens in reasonable time)

2. Test scenarios:
   - Auto-compression triggers at 95% threshold
   - Manual compression works regardless of threshold
   - Compressed context is used in buildAIContext
   - Multiple compressions create summary chain
   - Errors are logged and thrown appropriately

3. Performance validation:
   - Token counting 100K tokens should complete < 500ms
   - Compression workflow should handle 100+ messages
   - Database operations should be efficient (no N+1 queries)

**Acceptance:**
- Run all integration tests: `pnpm run test:backend`
- All tests pass
- Code coverage > 80% for compression services
- No performance regressions (use vitest benchmark if needed)
- Manual verification: Create large session, run compression, verify summary in database


## Concrete Steps

This section provides exact commands to execute. Update as work proceeds.

**Step 1: Create directory structure**
```bash
mkdir -p src/backend/compression/__tests__
```

**Step 2: Install dependencies**
```bash
pnpm add tiktoken
```

**Step 3: Run database migration (after creating schema)**
```bash
pnpm run drizzle-kit push
```

**Step 4: Run tests during development**
```bash
# Run all backend tests
pnpm run test:backend

# Run specific test file
pnpm run test:backend src/backend/compression/__tests__/TokenCounter.test.ts

# Run with coverage
pnpm run test:backend --coverage
```

**Step 5: Check database manually**
```bash
# View model configurations
sqlite3 ./tmp/db/app.db "SELECT * FROM modelConfigs"

# View session snapshots
sqlite3 ./tmp/db/app.db "SELECT * FROM sessionSnapshots WHERE kind='summary'"

# Count tokens in a session
sqlite3 ./tmp/db/app.db "SELECT SUM(inputTokens + outputTokens) FROM chatMessages WHERE sessionId='<session-id>'"
```

**Step 6: Verify TypeScript types**
```bash
pnpm run typecheck:node
```


## Validation and Acceptance

**Per-milestone acceptance:**
Each milestone includes specific acceptance criteria. Run the commands listed in each milestone's acceptance section.

**Phase 1 overall acceptance:**
1. All backend tests pass: `pnpm run test:backend`
2. TypeScript type checking passes: `pnpm run typecheck:node`
3. Database has modelConfigs table with seeded data
4. TokenCounter can count 100K tokens in < 500ms
5. CompressionService can compress a 100-message conversation
6. Integration tests demonstrate full compression workflow
7. Code coverage > 80% for compression services

**Observable outcomes:**
- `sqlite3 ./tmp/db/app.db "SELECT COUNT(*) FROM modelConfigs"` returns > 10 (seeded models)
- Unit tests for all five services pass
- Integration test creates compression snapshot in sessionSnapshots table
- Token count after compression is < 30% of original token count


## Idempotence and Recovery

**Safe practices:**
- Database migrations are idempotent (use `IF NOT EXISTS`)
- Seed data checks for existing configs before inserting
- Tests use isolated database or transactions
- TokenCounter.dispose() can be called multiple times safely

**Recovery paths:**
- If migration fails: `pnpm run db:reset` to reset dev database
- If tests fail: Check logs in `./tmp/logs/app.log`
- If tiktoken installation fails: `pnpm install --force`
- If database is corrupted: `rm -f ./tmp/db/app.db && pnpm run drizzle-kit push`

**Cleanup after completion:**
- Run `pnpm run lint` and `pnpm run format`
- Commit changes with descriptive messages
- No temporary files left in repository
- Dev database remains clean for next phase


## Artifacts and Notes

**Expected test output:**
```
 ✓ src/backend/compression/__tests__/TokenCounter.test.ts (12 tests)
 ✓ src/backend/compression/__tests__/ModelConfigService.test.ts (15 tests)
 ✓ src/backend/compression/__tests__/SummarizationService.test.ts (8 tests)
 ✓ src/backend/compression/__tests__/ChatSessionStore.test.ts (10 tests)
 ✓ src/backend/compression/__tests__/CompressionService.test.ts (20 tests)
 ✓ src/backend/compression/__tests__/integration.test.ts (6 tests)

 Test Files  6 passed (6)
      Tests  71 passed (71)
   Duration  5.23s
```

**Example database query output:**
```
sqlite> SELECT id, provider, model, maxInputTokens FROM modelConfigs LIMIT 3;
openai:gpt-4o|openai|gpt-4o|111616
anthropic:claude-sonnet-4-5-20250929|anthropic|claude-sonnet-4-5-20250929|136000
google:gemini-2.5-pro|google|gemini-2.5-pro|983041
```

**Example compression result:**
```typescript
{
  compressed: true,
  summaryId: "abc123...",
  originalTokenCount: 15430,
  newTokenCount: 3210,  // 79% reduction
  messagesCompressed: 45,
  messageCutoffId: "msg-xyz...",
  summary: "## Context\nThe user requested implementation of..."
}
```


## Interfaces and Dependencies

This section specifies the exact TypeScript interfaces and function signatures.

**File: src/backend/compression/TokenCounter.ts**
```typescript
import { get_encoding, type Tiktoken } from 'tiktoken';
import type { ChatMessage } from '@common/types';

interface TokenCountResult {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  estimatedResponseTokens: number;
}

export class TokenCounter {
  private encoding: Tiktoken;

  constructor();
  countMessageTokens(message: ChatMessage): number;
  countConversationTokens(messages: ChatMessage[]): TokenCountResult;
  countText(text: string): number;
  dispose(): void;
}
```

**File: src/backend/compression/ModelConfigService.ts**
```typescript
import type { Database } from 'better-sqlite3';

interface ModelConfig {
  id: string;                   // "provider:model"
  provider: string;             // openai, anthropic, google, azure
  model: string;                // Model name
  maxInputTokens: number;       // Maximum input context tokens
  maxOutputTokens: number;      // Maximum response tokens
  defaultCompressionThreshold: number; // 0-1
  recommendedRetentionTokens: number;
  source: 'api' | 'manual' | 'default';
  lastUpdated: number;
  createdAt: number;
}

export class ModelConfigService {
  constructor(db: Database);

  async getConfig(provider: string, model: string): Promise<ModelConfig>;
  async detectFromAPI(provider: string, model: string): Promise<ModelConfig | null>;
  async saveConfig(config: ModelConfig): Promise<void>;
  async getAllConfigs(): Promise<ModelConfig[]>;
  async updateConfig(id: string, updates: Partial<ModelConfig>): Promise<void>;
  async deleteConfig(id: string): Promise<void>;
}
```

**File: src/backend/compression/SummarizationService.ts**
```typescript
import type { AIProviderFactory } from '@backend/ai/factory';

interface SummarizationOptions {
  messages: AIMessage[];
  provider: string;
  model: string;
  sessionId: string;
  promptTemplate?: string;
}

export class SummarizationService {
  constructor(aiFactory: AIProviderFactory);

  async summarize(options: SummarizationOptions): Promise<string>;
  private getSummarizationPrompt(conversationText: string): string;
  private selectSummarizationModel(provider: string): string;
}
```

**File: src/backend/compression/CompressionService.ts**
```typescript
import type { TokenCounter } from './TokenCounter';
import type { SummarizationService } from './SummarizationService';
import type { ChatSessionStore } from '@backend/session/ChatSessionStore';
import type { ModelConfigService } from './ModelConfigService';

interface CompressionOptions {
  sessionId: string;
  provider: string;
  model: string;
  apiKey?: string;
  retentionTokenCount?: number;
  force?: boolean;
}

interface CompressionResult {
  compressed: boolean;
  summaryId?: string;
  originalTokenCount: number;
  newTokenCount: number;
  messagesCompressed: number;
  messageCutoffId?: string;
  summary?: string;
}

interface ContextCheckResult {
  needsCompression: boolean;
  currentTokenCount: number;
  contextLimit: number;
  thresholdTokenCount: number;
  utilizationPercentage: number;
  retentionTokenBudget: number;
  retainedMessageCount: number;
  compressibleMessageCount: number;
}

export class CompressionService {
  constructor(
    tokenCounter: TokenCounter,
    summarizationService: SummarizationService,
    sessionStore: ChatSessionStore,
    modelConfigService: ModelConfigService
  );

  async checkContext(
    sessionId: string,
    provider: string,
    model: string,
    additionalInput?: string
  ): Promise<ContextCheckResult>;

  async autoCompress(options: CompressionOptions): Promise<CompressionResult>;
  async manualCompress(options: CompressionOptions): Promise<CompressionResult>;
  async getCompressionConfig(sessionId: string): Promise<CompressionConfig>;
  async buildContextForAI(sessionId: string): Promise<AIMessage[]>;
}
```

**File: src/backend/db/schema.ts (additions)**
```typescript
import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

export const modelConfigs = sqliteTable('modelConfigs', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  maxInputTokens: integer('maxInputTokens').notNull(),
  maxOutputTokens: integer('maxOutputTokens').notNull(),
  defaultCompressionThreshold: real('defaultCompressionThreshold').notNull().default(0.95),
  recommendedRetentionTokens: integer('recommendedRetentionTokens').notNull().default(1000),
  source: text('source').notNull(),
  lastUpdated: integer('lastUpdated', { mode: 'timestamp' }).notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
});

export const modelConfigsProviderIdx = index('modelConfigs_provider_idx').on(modelConfigs.provider);
```

**Dependencies:**
- `tiktoken` (^1.0.0) - Token counting library
- `ai` (v5, already installed) - AI SDK for summarization
- `drizzle-orm` (already installed) - Database ORM
- `better-sqlite3` (already installed) - SQLite driver
- `vitest` (already installed) - Testing framework


---

**Plan Revision History:**

- 2025-11-17: Initial creation for Phase 1 backend implementation
  - Defined six milestones with clear acceptance criteria
  - Specified all TypeScript interfaces and database schema
  - Included concrete steps and validation procedures
  - Based on REQUIREMENTS.md v1.6 and DESIGN.md v3.1
