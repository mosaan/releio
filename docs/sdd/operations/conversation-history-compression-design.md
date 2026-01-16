# Conversation History Compression - Implementation Design

## Overview

This document describes the technical architecture and implementation approach for the conversation history compression feature. It provides detailed design specifications for developers to implement the requirements defined in `CONVERSATION_HISTORY_COMPRESSION_REQUIREMENTS.md`.

## Architecture Overview

### System Components

```mermaid
graph TB
    subgraph Renderer Process
        A[Chat UI] --> B[AIRuntimeProvider]
        B --> C[SessionManager]
        D[CompressionUI] --> E[CompressionController]
    end

    subgraph Backend Process
        F[IPC Handler] --> G[CompressionService]
        G --> H[TokenCounter]
        G --> I[SummarizationService]
        G --> J[ChatSessionStore]
        H --> K[tiktoken o200k_base]
        I --> N[AI Provider]
        J --> O[(SQLite DB)]
    end

    B -->|IPC: sendMessage| F
    E -->|IPC: compressHistory| F
    F -->|Context Check| G
    G -->|Store Summary| J

    style G fill:#e1f5ff
    style H fill:#fff4e1
    style I fill:#ffe1f5
```

### Three-Process Architecture

Following the application's existing pattern:

1. **Renderer Process**
   - UI components for compression controls and visualization
   - Token usage indicators
   - Summary display components
   - Manual compression triggers

2. **Backend Process**
   - Core compression logic (`CompressionService`)
   - Token counting (`TokenCounter`)
   - Summarization orchestration (`SummarizationService`)
   - Database operations via `ChatSessionStore`

3. **Main Process**
   - IPC routing between renderer and backend
   - Minimal logic (follows existing pattern)

## Component Design

### 1. TokenCounter Service

**Location:** `src/backend/compression/TokenCounter.ts`

**Responsibilities:**
- Count tokens using local calculation (tiktoken o200k_base recommended)
- Provide fast, local token counting without API calls
- Handle message parts (text, tool calls, attachments)

**Design Decision:** See `CONVERSATION_HISTORY_COMPRESSION_TOKEN_COUNTING_STRATEGY.md` for detailed rationale. All token counting is performed locally; API response token counts may be recorded for monitoring but are not used for compression decisions.

**Interface:**
```typescript
interface TokenCountResult {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  estimatedResponseTokens: number;
}

class TokenCounter {
  private encoding: Tiktoken; // o200k_base encoding

  constructor();

  /**
   * Count tokens for a single message using local calculation
   * Uses tiktoken o200k_base encoding (recommended)
   */
  countMessageTokens(message: ChatMessage): number;

  /**
   * Count tokens for an array of messages
   */
  countConversationTokens(messages: ChatMessage[]): TokenCountResult;

  /**
   * Count tokens for raw text
   */
  countText(text: string): number;

  /**
   * Clean up resources
   */
  dispose(): void;
}
```

**Implementation Details:**

#### Local Token Counting

```typescript
import { get_encoding, type Tiktoken } from 'tiktoken';

class TokenCounter {
  private encoding: Tiktoken;

  constructor() {
    // Use o200k_base encoding (recommended for all providers)
    this.encoding = get_encoding('o200k_base');
  }

  /**
   * Count tokens for a single message using local calculation
   */
  countMessageTokens(message: ChatMessage): number {
    // Always calculate locally
    return this.calculateTokens(message);
  }

  /**
   * Calculate tokens using tiktoken o200k_base
   */
  private calculateTokens(message: ChatMessage): number {
    let tokenCount = 0;

    // Message structure overhead (role + formatting)
    tokenCount += 4;

    // Count all message parts
    for (const part of message.parts) {
      if (part.kind === 'text' && part.contentText) {
        tokenCount += this.encoding.encode(part.contentText).length;
      }

      // Tool invocations: serialize JSON and count
      if (part.kind === 'tool_invocation' && part.contentJson) {
        const jsonString = JSON.stringify(JSON.parse(part.contentJson));
        tokenCount += this.encoding.encode(jsonString).length;
      }

      // Tool results: serialize JSON and count
      if (part.kind === 'tool_result' && part.contentJson) {
        const jsonString = JSON.stringify(JSON.parse(part.contentJson));
        tokenCount += this.encoding.encode(jsonString).length;
      }

      // Attachments: count metadata only (not content)
      if (part.kind === 'attachment') {
        const metadata = `${part.contentText || ''} ${part.mimeType || ''}`;
        tokenCount += this.encoding.encode(metadata).length;
      }
    }

    return tokenCount;
  }

  /**
   * Count tokens for raw text
   */
  countText(text: string): number {
    return this.encoding.encode(text).length;
  }

  /**
   * Count tokens for an array of messages
   */
  countConversationTokens(messages: ChatMessage[]): TokenCountResult {
    let totalTokens = 0;
    let inputTokens = 0;
    let outputTokens = 0;

    for (const message of messages) {
      const messageTokens = this.countMessageTokens(message);
      totalTokens += messageTokens;

      // Categorize by role
      if (message.role === 'user') {
        inputTokens += messageTokens;
      } else if (message.role === 'assistant') {
        outputTokens += messageTokens;
      }
    }

    return {
      totalTokens,
      inputTokens,
      outputTokens,
      estimatedResponseTokens: 0, // Will be set based on model config
    };
  }

  dispose() {
    this.encoding.free();
  }
}
```

**Key Points:**
1. **Single tokenizer**: tiktoken o200k_base for all providers (recommended)
2. **Always local**: All token counting performed locally before sending requests
3. **No API calls**: Fast, offline-capable token counting
4. **Handles all message types**: text, tool calls, tool results, attachments
5. **Acceptable accuracy**: ±10-15% for non-OpenAI models is acceptable for 95% threshold detection

### 2. Model Configuration Service

**Location:** `src/backend/compression/ModelConfigService.ts`

**Purpose:** Database-backed configuration management for AI models

**Interface:**
```typescript
interface ModelConfig {
  id: string;                   // Unique identifier (provider:model)
  provider: string;             // AI provider (openai, anthropic, google, azure)
  model: string;                // Model name
  maxInputTokens: number;       // Maximum input context tokens (critical for compression)
  maxOutputTokens: number;      // Maximum response tokens
  defaultCompressionThreshold: number; // Percentage (0-1)
  recommendedRetentionTokens: number;  // Tokens to preserve for recent messages
  source: 'api' | 'manual' | 'default'; // How this config was obtained
  lastUpdated: number;          // Timestamp of last update
}

// Note: All models use tiktoken o200k_base for local token counting (recommended)
//       Alternative tokenizers may be used if they provide better accuracy

class ModelConfigService {
  constructor(private db: Database);

  /**
   * Get configuration for a specific model
   * If not in database, attempts to detect from API and stores it
   */
  async getConfig(provider: string, model: string): Promise<ModelConfig>;

  /**
   * Detect model configuration from API metadata
   * Returns null if detection fails
   */
  async detectFromAPI(provider: string, model: string): Promise<ModelConfig | null>;

  /**
   * Save or update model configuration
   */
  async saveConfig(config: ModelConfig): Promise<void>;

  /**
   * Get all stored model configurations
   */
  async getAllConfigs(): Promise<ModelConfig[]>;

  /**
   * Update specific fields of a model configuration
   */
  async updateConfig(id: string, updates: Partial<ModelConfig>): Promise<void>;

  /**
   * Delete a model configuration
   */
  async deleteConfig(id: string): Promise<void>;
}
```

**Default Fallback Values:**
```typescript
const DEFAULT_CONFIG: Partial<ModelConfig> = {
  maxInputTokens: 128000,       // Conservative default
  maxOutputTokens: 4096,
  defaultCompressionThreshold: 0.95,
  recommendedRetentionTokens: 1000,
  source: 'default'
};
```

**Known Model Configurations (Initial Seed Data):**

These configurations should be seeded into the database on first run:

```typescript
const SEED_CONFIGS: ModelConfig[] = [
  // OpenAI models
  {
    id: 'openai:gpt-5',
    provider: 'openai',
    model: 'gpt-5',
    maxInputTokens: 272000,  // 400K - 128K
    maxOutputTokens: 128000,
    defaultCompressionThreshold: 0.95,
    recommendedRetentionTokens: 2000,
    source: 'api',
    lastUpdated: Date.now()
  },
  {
    id: 'openai:gpt-4o',
    provider: 'openai',
    model: 'gpt-4o',
    maxInputTokens: 111616,  // 128K - 16K
    maxOutputTokens: 16384,
    defaultCompressionThreshold: 0.95,
    recommendedRetentionTokens: 1000,
    source: 'api',
    lastUpdated: Date.now()
  },
  {
    id: 'openai:gpt-4o-mini',
    provider: 'openai',
    model: 'gpt-4o-mini',
    maxInputTokens: 111616,  // 128K - 16K
    maxOutputTokens: 16384,
    defaultCompressionThreshold: 0.95,
    recommendedRetentionTokens: 1000,
    source: 'api',
    lastUpdated: Date.now()
  },
  {
    id: 'openai:gpt-4-turbo',
    provider: 'openai',
    model: 'gpt-4-turbo',
    maxInputTokens: 123904,  // 128K - 4K
    maxOutputTokens: 4096,
    defaultCompressionThreshold: 0.95,
    recommendedRetentionTokens: 1000,
    source: 'api',
    lastUpdated: Date.now()
  },

  // Anthropic models (4.5 generation)
  {
    id: 'anthropic:claude-sonnet-4-5-20250929',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5-20250929',
    maxInputTokens: 136000,  // 200K - 64K (1M with beta header available)
    maxOutputTokens: 64000,
    defaultCompressionThreshold: 0.95,
    recommendedRetentionTokens: 1500,
    source: 'api',
    lastUpdated: Date.now()
  },
  {
    id: 'anthropic:claude-opus-4-1',
    provider: 'anthropic',
    model: 'claude-opus-4-1',
    maxInputTokens: 196000,  // 200K - 4K
    maxOutputTokens: 4096,
    defaultCompressionThreshold: 0.95,
    recommendedRetentionTokens: 1500,
    source: 'api',
    lastUpdated: Date.now()
  },
  {
    id: 'anthropic:claude-haiku-4-5',
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    maxInputTokens: 136000,  // 200K - 64K
    maxOutputTokens: 64000,
    defaultCompressionThreshold: 0.95,
    recommendedRetentionTokens: 1500,
    source: 'api',
    lastUpdated: Date.now()
  },

  // Legacy Anthropic models (3.x generation)
  {
    id: 'anthropic:claude-3-5-sonnet-20241022',
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    maxInputTokens: 191808,  // 200K - 8K
    maxOutputTokens: 8192,
    defaultCompressionThreshold: 0.95,
    recommendedRetentionTokens: 1500,
    source: 'api',
    lastUpdated: Date.now()
  },
  {
    id: 'anthropic:claude-3-opus-20240229',
    provider: 'anthropic',
    model: 'claude-3-opus-20240229',
    maxInputTokens: 196000,  // 200K - 4K
    maxOutputTokens: 4096,
    defaultCompressionThreshold: 0.95,
    recommendedRetentionTokens: 1500,
    source: 'api',
    lastUpdated: Date.now()
  },
  {
    id: 'anthropic:claude-3-haiku-20240307',
    provider: 'anthropic',
    model: 'claude-3-haiku-20240307',
    maxInputTokens: 196000,  // 200K - 4K
    maxOutputTokens: 4096,
    defaultCompressionThreshold: 0.95,
    recommendedRetentionTokens: 1500,
    source: 'api',
    lastUpdated: Date.now()
  },

  // Google models
  {
    id: 'google:gemini-2.5-pro',
    provider: 'google',
    model: 'gemini-2.5-pro',
    maxInputTokens: 983041,  // 1M - 65K
    maxOutputTokens: 65535,
    defaultCompressionThreshold: 0.98, // Higher threshold due to massive context
    recommendedRetentionTokens: 2000,
    source: 'api',
    lastUpdated: Date.now()
  },
  {
    id: 'google:gemini-2.5-flash',
    provider: 'google',
    model: 'gemini-2.5-flash',
    maxInputTokens: 983041,  // 1M - 65K
    maxOutputTokens: 65535,
    defaultCompressionThreshold: 0.98,
    recommendedRetentionTokens: 2000,
    source: 'api',
    lastUpdated: Date.now()
  },
];
```

**Implementation Notes:**

1. **Database Schema**: Add a `modelConfigs` table to store these configurations
2. **Initialization**: Seed database with `SEED_CONFIGS` on first run
3. **Dynamic Updates**: When new models are detected, attempt API metadata retrieval and store
4. **User Overrides**: Allow users to edit any configuration value via Settings UI
5. **maxInputTokens Calculation**: When both context window and max output are known from API:
   ```typescript
   maxInputTokens = contextWindow - maxOutputTokens
   ```


### 3. CompressionService

**Location:** `src/backend/compression/CompressionService.ts`

**Responsibilities:**
- Orchestrate compression workflow
- Determine when compression is needed
- Manage compression state
- Coordinate between TokenCounter, SummarizationService, and ChatSessionStore

**Interface:**
```typescript
interface CompressionOptions {
  sessionId: string;
  provider: string;
  model: string;
  apiKey?: string;
  retentionTokenCount?: number; // Override default retention token budget
  force?: boolean; // For manual compression
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

class CompressionService {
  constructor(
    private tokenCounter: TokenCounter,
    private summarizationService: SummarizationService,
    private sessionStore: ChatSessionStore,
    private modelConfigService: ModelConfigService
  );

  /**
   * Check if conversation needs compression before sending to AI
   * Returns context status and recommendation
   */
  async checkContext(
    sessionId: string,
    provider: string,
    model: string,
    additionalInput?: string
  ): Promise<ContextCheckResult>;

  /**
   * Perform automatic compression (called before AI request if needed)
   */
  async autoCompress(options: CompressionOptions): Promise<CompressionResult>;

  /**
   * Perform manual compression (user-initiated)
   */
  async manualCompress(options: CompressionOptions): Promise<CompressionResult>;

  /**
   * Get compression configuration for session
   */
  async getCompressionConfig(sessionId: string): Promise<CompressionConfig>;

  /**
   * Construct context for AI request (summary + recent messages)
   */
  async buildContextForAI(sessionId: string): Promise<AIMessage[]>;
}
```

**Key Methods Implementation:**

```typescript
async checkContext(
  sessionId: string,
  provider: string,
  model: string,
  additionalInput?: string
): Promise<ContextCheckResult> {
  // 1. Get model configuration (database-backed)
  const modelConfig = await this.modelConfigService.getConfig(provider, model);
  if (!modelConfig) {
    throw new Error(`Model configuration not found: ${provider}:${model}`);
  }

  // 2. Fetch all messages from session
  const session = await this.sessionStore.getSession(sessionId);
  const messages = session.messages;

  // 3. Get latest summary if exists
  const latestSummary = await this.sessionStore.getLatestSnapshot(sessionId, 'summary');

  // 4. Build current context (summary + all messages after cutoff)
  let contextMessages: AIMessage[] = [];
  if (latestSummary) {
    const summaryContent = JSON.parse(latestSummary.contentJson);
    contextMessages.push({
      role: 'system',
      content: `[Previous conversation summary]\n${summaryContent.summaryText}`,
    });

    // Only include messages after cutoff
    const cutoffIndex = messages.findIndex(m => m.id === latestSummary.messageCutoffId);
    contextMessages.push(...messages.slice(cutoffIndex + 1));
  } else {
    contextMessages = [...messages];
  }

  // 5. Add additional input if provided
  if (additionalInput) {
    contextMessages.push({ role: 'user', content: additionalInput });
  }

  // 6. Count tokens
  const tokenCount = await this.tokenCounter.countConversationTokens(contextMessages);

  // 7. Calculate available space for input
  // maxInputTokens already accounts for maxOutputTokens (= contextWindow - maxOutputTokens)
  const safetyMargin = Math.floor(modelConfig.maxInputTokens * 0.05);
  const availableForContext = modelConfig.maxInputTokens - safetyMargin;

  // 8. Determine if compression needed
  const threshold = modelConfig.defaultCompressionThreshold;
  const thresholdTokenCount = Math.floor(availableForContext * threshold);
  const needsCompression = tokenCount.totalTokens > thresholdTokenCount;

  // 9. Calculate retention boundary based on token budget
  const retentionTokenBudget = modelConfig.recommendedRetentionTokens;

  // Count tokens from most recent messages backwards until budget is exhausted
  let retainedTokens = 0;
  let retainedMessageCount = 0;
  for (let i = contextMessages.length - 1; i >= 0; i--) {
    const messageTokens = await this.tokenCounter.countMessageTokens(contextMessages[i]);
    if (retainedTokens + messageTokens <= retentionTokenBudget) {
      retainedTokens += messageTokens;
      retainedMessageCount++;
    } else {
      break;
    }
  }

  const compressibleMessageCount = Math.max(0, contextMessages.length - retainedMessageCount);

  return {
    needsCompression,
    currentTokenCount: tokenCount.totalTokens,
    contextLimit: availableForContext,
    thresholdTokenCount,
    utilizationPercentage: tokenCount.totalTokens / availableForContext,
    retentionTokenBudget,
    retainedMessageCount,
    compressibleMessageCount,
  };
}

async autoCompress(options: CompressionOptions): Promise<CompressionResult> {
  const { sessionId, provider, model, retentionTokenCount } = options;

  // 1. Get model config (database-backed)
  const modelConfig = await this.modelConfigService.getConfig(provider, model);
  if (!modelConfig) {
    throw new Error(`Model configuration not found: ${provider}:${model}`);
  }

  // 2. Fetch session messages
  const session = await this.sessionStore.getSession(sessionId);
  const messages = session.messages;

  // 3. Determine retention boundary based on token budget
  const retentionTokenBudget = retentionTokenCount ?? modelConfig.recommendedRetentionTokens;

  // Count tokens from most recent messages backwards until budget is exhausted
  let retainedTokens = 0;
  let retainedMessageCount = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const messageTokens = await this.tokenCounter.countMessageTokens(messages[i]);
    if (retainedTokens + messageTokens <= retentionTokenBudget) {
      retainedTokens += messageTokens;
      retainedMessageCount++;
    } else {
      break;
    }
  }

  // Not enough tokens to compress (all messages fit within retention budget)
  if (retainedMessageCount >= messages.length) {
    return {
      compressed: false,
      originalTokenCount: 0,
      newTokenCount: 0,
      messagesCompressed: 0,
    };
  }

  // 4. Split messages: to-compress vs. to-retain
  const splitIndex = messages.length - retainedMessageCount;
  const messagesToCompress = messages.slice(0, splitIndex);
  const messagesToRetain = messages.slice(splitIndex);

  // 5. Check if there's already a summary covering these messages
  const latestSummary = await this.sessionStore.getLatestSnapshot(sessionId, 'summary');
  let summaryInput = messagesToCompress;

  if (latestSummary) {
    const cutoffIndex = messages.findIndex(m => m.id === latestSummary.messageCutoffId);
    if (cutoffIndex >= 0 && cutoffIndex < splitIndex) {
      // Include previous summary and new messages
      const summaryContent = JSON.parse(latestSummary.contentJson);
      const newMessages = messages.slice(cutoffIndex + 1, splitIndex);
      summaryInput = [
        { role: 'system', content: summaryContent.summaryText },
        ...newMessages,
      ];
    }
  }

  // 6. Count tokens before compression
  const originalTokens = await this.tokenCounter.countConversationTokens(messagesToCompress);

  // 7. Generate summary
  const summaryText = await this.summarizationService.summarize({
    messages: summaryInput,
    provider,
    model,
    sessionId,
  });

  // 8. Count summary tokens
  const summaryTokens = await this.tokenCounter.countMessageTokens({
    role: 'system',
    content: summaryText,
  });

  // 9. Store summary in database
  const messageCutoffId = messagesToCompress[messagesToCompress.length - 1].id;
  const summarySnapshot = await this.sessionStore.createSnapshot({
    sessionId,
    kind: 'summary',
    contentJson: JSON.stringify({
      summaryText,
      messageRange: {
        firstMessageId: messagesToCompress[0].id,
        lastMessageId: messageCutoffId,
      },
      compressionTimestamp: new Date().toISOString(),
      compressionType: 'auto',
      originalTokenCount: originalTokens.totalTokens,
      summaryTokenCount: summaryTokens,
      messagesIncluded: messagesToCompress.length,
    }),
    messageCutoffId,
    tokenCount: summaryTokens,
  });

  // 10. Return result
  return {
    compressed: true,
    summaryId: summarySnapshot.id,
    originalTokenCount: originalTokens.totalTokens,
    newTokenCount: summaryTokens + (await this.tokenCounter.countConversationTokens(messagesToRetain)).totalTokens,
    messagesCompressed: messagesToCompress.length,
    messageCutoffId,
    summary: summaryText,
  };
}
```

### 4. SummarizationService

**Location:** `src/backend/compression/SummarizationService.ts`

**Responsibilities:**
- Generate summaries using AI models
- Manage summarization prompts
- Handle summarization errors and retries

**Interface:**
```typescript
interface SummarizationOptions {
  messages: AIMessage[];
  provider: string;
  model: string;
  sessionId: string;
  promptTemplate?: string; // Custom prompt (optional)
}

class SummarizationService {
  constructor(private aiFactory: AIProviderFactory);

  /**
   * Generate a summary of conversation messages
   */
  async summarize(options: SummarizationOptions): Promise<string>;

  /**
   * Get default summarization prompt
   */
  private getSummarizationPrompt(messages: AIMessage[]): string;

  /**
   * Select model for summarization (may differ from conversation model)
   */
  private selectSummarizationModel(provider: string): string;
}
```

**Implementation:**
```typescript
async summarize(options: SummarizationOptions): Promise<string> {
  const { messages, provider, sessionId, promptTemplate } = options;

  // 1. Select summarization model (use cheaper/faster model)
  const summaryModel = this.selectSummarizationModel(provider);

  // 2. Build summarization prompt
  const conversationText = messages.map(m => {
    return `${m.role.toUpperCase()}: ${m.content}`;
  }).join('\n\n');

  const prompt = promptTemplate ?? this.getSummarizationPrompt(conversationText);

  // 3. Call AI to generate summary
  try {
    const model = this.aiFactory.createModel(provider, summaryModel);
    const result = await generateText({
      model,
      prompt,
      temperature: 0.3, // Lower temperature for consistent summaries
    });

    return result.text;
  } catch (error) {
    logger.error('Summarization failed', { sessionId, provider, error });
    throw new Error('Failed to generate conversation summary');
  }
}

private getSummarizationPrompt(conversationText: string): string {
  return `You are a conversation summarization assistant. Your task is to create a concise yet comprehensive summary of the conversation history provided below.

**Guidelines:**
1. Preserve all key facts, decisions, and important context
2. Maintain chronological order of significant events
3. Keep technical details, code examples, and specific implementation decisions
4. Include information about tool invocations and their results (e.g., file operations, API calls, database queries)
5. Use concise language to maximize information density
6. Focus on actionable information and outcomes
7. Omit pleasantries, greetings, and off-topic discussions

**Conversation History:**
${conversationText}

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

## Tool Invocations
[Significant tool calls made (file operations, searches, API calls) and their outcomes]

## Decisions and Outcomes
[Agreements reached, decisions made, next steps identified]

## Unresolved Questions
[Any open questions or pending items]`;
}

private selectSummarizationModel(provider: string): string {
  // Use cheaper models for summarization
  const summaryModels: Record<string, string> = {
    'openai': 'gpt-4o-mini',
    'anthropic': 'claude-haiku-4-5',
    'google': 'gemini-2.5-flash',
    'azure': 'gpt-4o-mini',
  };
  return summaryModels[provider] || 'gpt-4o-mini';
}
```

### 5. Database Extensions

#### 5.1 New Database Table: modelConfigs

**Location:** `src/backend/db/schema.ts`

**Schema:**
```typescript
export const modelConfigs = sqliteTable('modelConfigs', {
  id: text('id').primaryKey(), // Format: "provider:model" (e.g., "openai:gpt-4o")
  provider: text('provider').notNull(), // openai, anthropic, google, azure
  model: text('model').notNull(), // Model name
  maxInputTokens: integer('maxInputTokens').notNull(), // Maximum input context tokens
  maxOutputTokens: integer('maxOutputTokens').notNull(), // Maximum response tokens
  defaultCompressionThreshold: real('defaultCompressionThreshold').notNull().default(0.95), // 0-1
  recommendedRetentionTokens: integer('recommendedRetentionTokens').notNull().default(1000),
  source: text('source').notNull(), // 'api' | 'manual' | 'default'
  lastUpdated: integer('lastUpdated', { mode: 'timestamp' }).notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
});

// Index for provider lookups
export const modelConfigsProviderIdx = index('modelConfigs_provider_idx').on(modelConfigs.provider);
```

**Migration:**
```sql
CREATE TABLE modelConfigs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  maxInputTokens INTEGER NOT NULL,
  maxOutputTokens INTEGER NOT NULL,
  defaultCompressionThreshold REAL NOT NULL DEFAULT 0.95,
  recommendedRetentionTokens INTEGER NOT NULL DEFAULT 1000,
  source TEXT NOT NULL,
  lastUpdated INTEGER NOT NULL,
  createdAt INTEGER NOT NULL
);

CREATE INDEX modelConfigs_provider_idx ON modelConfigs(provider);
```

**Seed Data:** On first run, the application should seed the database with the configurations defined in section 2 (Model Configuration Service).

#### 5.2 Updates to ChatSessionStore

**Location:** Updates to `src/backend/session/ChatSessionStore.ts`

**New Methods:**
```typescript
class ChatSessionStore {
  // ... existing methods ...

  /**
   * Create a session snapshot (summary, title, memory)
   */
  async createSnapshot(params: {
    sessionId: string;
    kind: 'title' | 'summary' | 'memory';
    contentJson: string;
    messageCutoffId: string;
    tokenCount: number;
  }): Promise<SessionSnapshot> {
    const now = Date.now();
    const snapshot = {
      id: randomUUID(),
      sessionId: params.sessionId,
      kind: params.kind,
      contentJson: params.contentJson,
      messageCutoffId: params.messageCutoffId,
      tokenCount: params.tokenCount,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(sessionSnapshots).values(snapshot);
    return snapshot;
  }

  /**
   * Get latest snapshot of a specific kind
   */
  async getLatestSnapshot(
    sessionId: string,
    kind: 'title' | 'summary' | 'memory'
  ): Promise<SessionSnapshot | null> {
    const result = await db
      .select()
      .from(sessionSnapshots)
      .where(
        and(
          eq(sessionSnapshots.sessionId, sessionId),
          eq(sessionSnapshots.kind, kind)
        )
      )
      .orderBy(desc(sessionSnapshots.createdAt))
      .limit(1);

    return result[0] ?? null;
  }

  /**
   * Get all snapshots for a session
   */
  async getSnapshots(sessionId: string): Promise<SessionSnapshot[]> {
    return db
      .select()
      .from(sessionSnapshots)
      .where(eq(sessionSnapshots.sessionId, sessionId))
      .orderBy(desc(sessionSnapshots.createdAt));
  }

  /**
   * Update token counts for a message
   */
  async updateMessageTokens(
    messageId: string,
    inputTokens: number,
    outputTokens: number
  ): Promise<void> {
    await db
      .update(chatMessages)
      .set({ inputTokens, outputTokens })
      .where(eq(chatMessages.id, messageId));
  }

  /**
   * Build context for AI request (includes summary if exists)
   */
  async buildAIContext(sessionId: string): Promise<AIMessage[]> {
    const latestSummary = await this.getLatestSnapshot(sessionId, 'summary');
    const session = await this.getSession(sessionId);

    const context: AIMessage[] = [];

    if (latestSummary) {
      const summaryContent = JSON.parse(latestSummary.contentJson);
      context.push({
        role: 'system',
        content: `[Previous conversation summary]\n${summaryContent.summaryText}`,
      });

      // Only include messages after cutoff
      const cutoffIndex = session.messages.findIndex(
        m => m.id === latestSummary.messageCutoffId
      );
      if (cutoffIndex >= 0) {
        context.push(...session.messages.slice(cutoffIndex + 1));
      }
    } else {
      context.push(...session.messages);
    }

    return context;
  }
}
```

### 6. IPC Interface

**Location:** `src/backend/handler.ts`, `src/preload/index.ts`

**New IPC Methods:**
```typescript
// Backend handler
export const compressionHandlers = {
  // Check if compression is needed
  checkCompression: async (sessionId: string, provider: string, model: string) => {
    const compressionService = getCompressionService();
    return await compressionService.checkContext(sessionId, provider, model);
  },

  // Manually trigger compression
  manualCompress: async (options: CompressionOptions) => {
    const compressionService = getCompressionService();
    return await compressionService.manualCompress(options);
  },

  // Get compression configuration
  getCompressionConfig: async (sessionId: string) => {
    const compressionService = getCompressionService();
    return await compressionService.getCompressionConfig(sessionId);
  },

  // Get session summaries
  getSessionSummaries: async (sessionId: string) => {
    const sessionStore = getChatSessionStore();
    return await sessionStore.getSnapshots(sessionId);
  },
};

// Preload API
export interface CompressionAPI {
  checkCompression(sessionId: string, provider: string, model: string): Promise<ContextCheckResult>;
  manualCompress(options: CompressionOptions): Promise<CompressionResult>;
  getCompressionConfig(sessionId: string): Promise<CompressionConfig>;
  getSessionSummaries(sessionId: string): Promise<SessionSnapshot[]>;
}

// In preload/index.ts
const compressionAPI: CompressionAPI = {
  checkCompression: (sessionId, provider, model) =>
    ipcRenderer.invoke('compression:check', sessionId, provider, model),
  manualCompress: (options) =>
    ipcRenderer.invoke('compression:manual', options),
  getCompressionConfig: (sessionId) =>
    ipcRenderer.invoke('compression:config', sessionId),
  getSessionSummaries: (sessionId) =>
    ipcRenderer.invoke('compression:summaries', sessionId),
};
```

### 7. UI Components

#### 7.1 Token Usage Indicator

**Location:** `src/renderer/src/components/TokenUsageIndicator.tsx`

```typescript
interface TokenUsageIndicatorProps {
  sessionId: string;
  provider: string;
  model: string;
}

export function TokenUsageIndicator({ sessionId, provider, model }: TokenUsageIndicatorProps) {
  const [contextStatus, setContextStatus] = useState<ContextCheckResult | null>(null);

  useEffect(() => {
    const checkContext = async () => {
      const status = await window.backend.checkCompression(sessionId, provider, model);
      setContextStatus(status);
    };

    checkContext();
    const interval = setInterval(checkContext, 5000); // Update every 5s

    return () => clearInterval(interval);
  }, [sessionId, provider, model]);

  if (!contextStatus) return null;

  const percentage = Math.round(contextStatus.utilizationPercentage * 100);
  const color = percentage > 95 ? 'red' : percentage > 80 ? 'orange' : 'green';

  return (
    <div className="flex items-center gap-2 text-sm">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 bg-${color}-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-gray-600 min-w-[4rem]">
        {contextStatus.currentTokenCount.toLocaleString()} / {contextStatus.contextLimit.toLocaleString()} tokens
      </span>
      {contextStatus.needsCompression && (
        <span className="text-orange-600 font-medium">Compression recommended</span>
      )}
    </div>
  );
}
```

#### 7.2 Manual Compression Button

**Location:** `src/renderer/src/components/CompressionControls.tsx`

```typescript
interface CompressionControlsProps {
  sessionId: string;
  provider: string;
  model: string;
  onCompressionComplete?: (result: CompressionResult) => void;
}

export function CompressionControls({
  sessionId,
  provider,
  model,
  onCompressionComplete,
}: CompressionControlsProps) {
  const [isCompressing, setIsCompressing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleCompress = async () => {
    setIsCompressing(true);
    try {
      const result = await window.backend.manualCompress({
        sessionId,
        provider,
        model,
        force: true,
      });

      if (result.compressed) {
        toast.success(
          `Compressed ${result.messagesCompressed} messages.
           Reduced from ${result.originalTokenCount} to ${result.newTokenCount} tokens.`
        );
        onCompressionComplete?.(result);
      }
    } catch (error) {
      toast.error('Failed to compress conversation history');
      logger.error('Manual compression failed', { error });
    } finally {
      setIsCompressing(false);
      setShowConfirm(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowConfirm(true)}
        disabled={isCompressing}
      >
        {isCompressing ? 'Compressing...' : 'Summarize History'}
      </Button>

      {showConfirm && (
        <ConfirmDialog
          title="Summarize Conversation History"
          description="This will create a summary of older messages to reduce context size. Original messages will still be accessible."
          onConfirm={handleCompress}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}
```

#### 7.3 Summary Display Component

**Location:** `src/renderer/src/components/SummaryDisplay.tsx`

```typescript
interface SummaryDisplayProps {
  sessionId: string;
}

export function SummaryDisplay({ sessionId }: SummaryDisplayProps) {
  const [summaries, setSummaries] = useState<SessionSnapshot[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const loadSummaries = async () => {
      const snapshots = await window.backend.getSessionSummaries(sessionId);
      const summarySnapshots = snapshots.filter(s => s.kind === 'summary');
      setSummaries(summarySnapshots);
    };

    loadSummaries();
  }, [sessionId]);

  if (summaries.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {summaries.map(summary => {
        const content = JSON.parse(summary.contentJson);
        const isExpanded = expanded.has(summary.id);

        return (
          <div key={summary.id} className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-blue-700">
                    Conversation Summary
                  </span>
                  <span className="text-xs text-gray-500">
                    {content.messagesIncluded} messages • {content.summaryTokenCount} tokens
                  </span>
                </div>
                <div className={`text-sm text-gray-700 ${!isExpanded && 'line-clamp-2'}`}>
                  {content.summaryText}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setExpanded(prev => {
                    const next = new Set(prev);
                    if (next.has(summary.id)) {
                      next.delete(summary.id);
                    } else {
                      next.add(summary.id);
                    }
                    return next;
                  });
                }}
              >
                {isExpanded ? 'Show less' : 'Show more'}
              </Button>
            </div>
            {isExpanded && (
              <div className="mt-2 text-xs text-gray-500">
                Compressed on {new Date(content.compressionTimestamp).toLocaleString()}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

## Data Flow

### Automatic Compression Flow

```mermaid
sequenceDiagram
    participant User
    participant ChatUI
    participant AIRuntimeProvider
    participant IPC
    participant CompressionService
    participant TokenCounter
    participant SummarizationService
    participant ChatSessionStore
    participant AIProvider

    User->>ChatUI: Send message
    ChatUI->>AIRuntimeProvider: Send message
    AIRuntimeProvider->>IPC: checkCompression(sessionId, provider, model)
    IPC->>CompressionService: checkContext()
    CompressionService->>ChatSessionStore: getSession(sessionId)
    ChatSessionStore-->>CompressionService: messages
    CompressionService->>TokenCounter: countConversationTokens(messages)
    TokenCounter-->>CompressionService: tokenCount

    alt Token count exceeds threshold
        CompressionService-->>IPC: { needsCompression: true }
        IPC-->>AIRuntimeProvider: needs compression
        AIRuntimeProvider->>IPC: autoCompress()
        IPC->>CompressionService: autoCompress()
        CompressionService->>SummarizationService: summarize(messages)
        SummarizationService->>AIProvider: generateText(summarization prompt)
        AIProvider-->>SummarizationService: summary text
        SummarizationService-->>CompressionService: summary
        CompressionService->>ChatSessionStore: createSnapshot(summary)
        ChatSessionStore-->>CompressionService: snapshot created
        CompressionService-->>IPC: compressionResult
        IPC-->>AIRuntimeProvider: compression complete
        AIRuntimeProvider->>ChatUI: Show notification
    end

    AIRuntimeProvider->>IPC: streamAIText(messages)
    Note over IPC: Now sends compressed context (summary + recent messages)
    IPC->>AIProvider: streamText()
    AIProvider-->>ChatUI: Stream response
```

### Manual Compression Flow

```mermaid
sequenceDiagram
    participant User
    participant CompressionControls
    participant IPC
    participant CompressionService
    participant SummarizationService
    participant ChatSessionStore

    User->>CompressionControls: Click "Summarize History"
    CompressionControls->>User: Show confirmation dialog
    User->>CompressionControls: Confirm
    CompressionControls->>IPC: manualCompress(options)
    IPC->>CompressionService: manualCompress()
    CompressionService->>ChatSessionStore: getSession(sessionId)
    ChatSessionStore-->>CompressionService: messages
    CompressionService->>SummarizationService: summarize(all messages)
    SummarizationService-->>CompressionService: summary text
    CompressionService->>ChatSessionStore: createSnapshot(summary)
    ChatSessionStore-->>CompressionService: snapshot created
    CompressionService-->>IPC: compressionResult
    IPC-->>CompressionControls: result
    CompressionControls->>User: Show success notification
```

## Testing Strategy

### Unit Tests

#### TokenCounter Tests
```typescript
describe('TokenCounter', () => {
  describe('Local Token Counting', () => {
    it('should count tokens for simple text messages', async () => {
      const counter = new TokenCounter();
      const tokens = counter.countMessageTokens({
        role: 'user',
        parts: [{ kind: 'text', content: 'Hello, world!' }],
      });
      expect(tokens).toBeGreaterThan(0);
    });

    it('should count tool calls accurately', async () => {
      // Test tool call token counting
    });

    it('should handle all message part types', async () => {
      // Test text, tool_invocation, tool_result, attachment
    });

    it('should be consistent across providers', async () => {
      // Same message should produce same token count regardless of provider
    });
  });
});
```

#### CompressionService Tests
```typescript
describe('CompressionService', () => {
  it('should detect when compression is needed', async () => {
    const service = new CompressionService(/* deps */);
    const result = await service.checkContext(sessionId, 'openai', 'gpt-4');
    expect(result.needsCompression).toBe(true);
  });

  it('should compress old messages and retain recent ones', async () => {
    const result = await service.autoCompress({
      sessionId,
      provider: 'openai',
      model: 'gpt-4o',
    });
    expect(result.compressed).toBe(true);
    expect(result.messagesCompressed).toBeGreaterThan(0);
  });

  it('should not compress if below threshold', async () => {
    // Test no-op case
  });
});
```

### Integration Tests

```typescript
describe('Compression Integration', () => {
  it('should compress conversation and use summary in next request', async () => {
    // 1. Create session with many messages
    // 2. Trigger compression
    // 3. Send new message
    // 4. Verify AI request uses summary + recent messages
  });

  it('should handle multiple compression cycles', async () => {
    // Test cascading summaries
  });
});
```

### Manual Testing Checklist

- [ ] Auto-compression triggers at 95% threshold (default, configurable)
- [ ] Manual compression works via UI button or slash command (/summarize)
- [ ] Token usage indicator updates in real-time
- [ ] Summaries display correctly in chat UI (if implemented)
- [ ] Compressed context reduces token count significantly
- [ ] AI responses maintain coherence after compression
- [ ] Error handling works - summarization failures prevent AI requests and show retry option
- [ ] Token counting failures show error and retry option (no unsafe fallbacks)
- [ ] Settings persist across app restarts
- [ ] Multi-provider support (OpenAI, Anthropic, Google)
- [ ] Threshold and retention token count are configurable per model

## Performance Considerations

### Token Counting Performance

**Challenge:** Token counting for every message on every request needs to be fast.

**Optimizations:**
1. **Local calculation**: All counting is done locally using tiktoken (no network latency)
2. **Incremental counting**: Only count new messages since last check
3. **Efficient implementation**: tiktoken o200k_base is optimized for speed
4. **Optional caching**: API response token counts may be recorded for monitoring (not used for decisions)
5. **Async operations**: Perform token counting in background, don't block UI

### Database Query Optimization

**Challenge:** Fetching messages and summaries efficiently.

**Optimizations:**
1. **Indexes**:
   ```sql
   CREATE INDEX idx_session_messages ON chatMessages(sessionId, createdAt);
   CREATE INDEX idx_session_snapshots ON sessionSnapshots(sessionId, kind, createdAt);
   ```
2. **Limit queries**: Only fetch messages after summary cutoff
3. **Pagination**: Don't load all messages at once in UI

### Summarization Latency

**Challenge:** Summarization can take 5-10 seconds for large conversations.

**Optimizations:**
1. **Use faster models**: GPT-4o-mini, Claude Haiku, Gemini Flash
2. **Show progress**: Display "Summarizing..." indicator to user
3. **Background processing**: Allow user to continue using app while summarizing
4. **Caching**: Don't re-summarize the same content

## Security and Privacy

### API Key Handling

- Never log API keys
- Use existing key storage mechanisms from settings
- Encrypt keys at rest

### Summary Content

- Summaries contain conversation content (potentially sensitive)
- Store in database with same security as messages
- No external transmission except to AI provider during summarization

### User Control

- Users can disable auto-compression
- Users can view/delete summaries
- Original messages always retained (never deleted)

## Dependencies

### New NPM Packages

```json
{
  "dependencies": {
    "tiktoken": "^1.0.0"
  }
}
```

**Note:** Anthropic and Google SDKs already included in project.

### Version Compatibility

- `ai` SDK: v5 (already in use)
- `tiktoken`: Latest stable (1.0+)
- Node.js: 18+ (for Anthropic/Google async APIs)

## Migration and Rollout

### Phase 1: Backend Implementation (Week 1-2)
1. Implement `TokenCounter` with tiktoken o200k_base
2. Implement `ModelConfigService` (database-backed)
3. Add `modelConfigs` table to database schema
4. Seed database with known model configurations
5. Implement `SummarizationService`
6. Implement `CompressionService`
7. Add database methods to `ChatSessionStore`
8. Unit tests for all services

### Phase 2: IPC and Integration (Week 2-3)
1. Add IPC handlers
2. Integrate with existing `streamAIText` flow
3. Add automatic compression logic
4. Integration tests

### Phase 3: UI Implementation (Week 3-4)
1. Implement `TokenUsageIndicator`
2. Implement `CompressionControls`
3. Implement `SummaryDisplay`
4. Add settings UI for configuration
5. Manual testing

### Phase 4: Multi-Provider Testing (Week 4-5)
1. Test token counting accuracy across all providers (OpenAI, Anthropic, Google)
2. Validate compression behavior with different model context limits
3. Performance tuning and optimization
4. Error handling refinement

### Phase 5: Polish and Documentation (Week 5-6)
1. Error handling improvements
2. User documentation
3. Performance optimization
4. Beta testing

## Implementation Decisions

### ✅ RESOLVED: Multi-Level Compression Strategy
**Decision:** Multi-level compression is REQUIRED. When a second compression is needed, the system SHALL include the previous summary plus subsequent messages as input for the new summary. This creates a cascading summary chain without depth limits.

**Implementation:** See `autoCompress` method lines 584-593 for logic that checks for existing summaries and includes them in re-summarization.

### ✅ RESOLVED: Token Counting Strategy
**Decision:** Local-only token counting using tiktoken o200k_base (recommended)

**Details:**
- **Always local**: All token counting performed locally before sending requests
- **No API calls**: Compression decisions require pre-request token counts (API responses come after)
- **Universal tokenizer**: tiktoken o200k_base provides reasonable accuracy across all providers (±10-15% for non-OpenAI)
- **Tool invocations**: Serialize JSON input/output, then count with tiktoken
- **Attachments**: Count metadata only (filename, MIME type, size) - not content
- **API tokens**: May be recorded for monitoring but NOT used for compression decisions (cumulative, not per-message)

**Rationale:** See `CONVERSATION_HISTORY_COMPRESSION_TOKEN_COUNTING_STRATEGY.md` for detailed analysis showing why hybrid approach was rejected.

### ✅ RESOLVED: Message Retention Strategy
**Decision:** Retention is based on TOKEN COUNT, not message count. The system retains the maximum number of recent messages that fit within a configurable token budget (default: 1000 tokens).

**Example:** If retention budget is 1000 tokens, and the most recent 3 messages total 900 tokens while 4 messages total 1100 tokens, retain 3 messages.

**Implementation:** See `checkContext` (lines 510-537) and `autoCompress` (lines 553-582) for token-based retention logic.

### ✅ RESOLVED: Message Pinning
**Decision:** Message pinning is NOT in scope for the current implementation. This feature will not be developed at this time.

## Open Implementation Questions

### 1. Should we cache tokenizer instances?
**Context:** Creating tiktoken encodings has overhead.
**Proposal:** Singleton pattern for tokenizers per model.
**Status:** To be decided during implementation.

### 2. How to handle token counting failures?
**Decision:** ✅ RESOLVED per FR-5.2.1

**Implementation:**
- Display error message to user
- Provide option to retry token counting
- Do NOT proceed with fallback counting methods
- Do NOT use approximate/estimated counting (unsafe)

**Rationale:** Fallback counting would be inaccurate and could lead to context limit violations. User must be involved to resolve the issue.

### ✅ RESOLVED: Automatic Summarization Failures
**Decision:** Per FR-5.1.1

**Implementation:**
- Log error with full context
- Display error notification to user
- Provide option to retry summarization manually
- Do NOT proceed with sending full conversation history (would exceed context limits)
- Prevent further AI requests until compression succeeds or user acknowledges the risk

**Rationale:** When auto-compression triggers (95% threshold), conversation is already near context limits. Sending full history after compression failure would almost certainly cause AI provider errors.

### 3. Should summaries be editable by users?
**Consideration:** Users may want to correct or enhance summaries.
**Complexity:** Medium (requires summary editing UI).
**Decision:** Phase 2 feature (not MVP).

### 4. Should we support exporting full conversation history?
**Use case:** Users want to keep full records before compression.
**Decision:** Good future feature, not required for MVP.

---

**Document Version:** 3.1
**Last Updated:** 2025-11-17
**Status:** Aligned with Requirements v1.5 - Ready for Implementation

**Major Changes in v3.1:**
- **Model configuration**: Changed from static `ModelConfigRegistry` to database-backed `ModelConfigService`
  - Model configurations now stored in database, not hardcoded
  - Added API auto-detection capability for new models
  - Conservative default fallback (128k tokens) when detection fails
  - User-configurable via Settings UI
  - Changed from `contextWindow` to `maxInputTokens` as the critical field
  - Calculation: `maxInputTokens = contextWindow - maxOutputTokens`
- **Database schema**: Added `modelConfigs` table requirement
- **Seed data**: Updated seed configurations with calculated `maxInputTokens` values
- **CompressionService**: Updated to use async `modelConfigService.getConfig()` instead of synchronous `ModelConfigRegistry.getConfig()`
- **Implementation phases**: Added database schema and seeding steps to Phase 1

**Major Changes in v3.0:**
- **Token counting**: Removed hybrid approach; all counting is now local-only using tiktoken o200k_base
  - API response tokens may be recorded for monitoring but NOT used for compression decisions
  - Compression decisions require pre-request token counts (timing issue with hybrid approach)
  - API response tokens are cumulative, not per-message (granularity issue)
- **Error handling**: Removed all unsafe fallback behaviors
  - Summarization failures: No fallback to full history; show error and retry option
  - Token counting failures: No approximate counting; show error and retry option
- **Architecture diagram**: Updated to show single tokenizer (tiktoken) instead of multiple APIs
- **Testing**: Updated tests to reflect local-only token counting
- **Manual compression**: Added slash command (/summarize) as trigger option
- **Configuration**: Clarified that threshold and retention defaults are SHOULD (recommendations), configurability is MUST

**Major Changes in v2.0:**
- Simplified token counting to hybrid approach (recorded + tiktoken o200k_base fallback) [DEPRECATED]
- Removed provider-specific tokenizer implementations (Anthropic API, Gemini API)
- Removed `tokenizerType` from ModelConfigRegistry (no longer needed)
- Added `CONVERSATION_HISTORY_COMPRESSION_TOKEN_COUNTING_STRATEGY.md` for decision rationale
