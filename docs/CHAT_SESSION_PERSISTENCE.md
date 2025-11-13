# Chat Session Persistence Implementation

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `.agent/PLANS.md` located at the repository root.

## Purpose / Big Picture

After implementing this feature, users will be able to close the application and return days later to find all their conversations exactly as they left them. Currently, when the user closes the app, every chat message disappears forever because nothing is saved to disk—all conversation state exists only in the computer's temporary memory. This change adds a database storage layer that automatically saves every message, every AI response, and every tool execution to a local SQLite database file on the user's hard drive.

You will see this working by starting the app, typing several messages to have a conversation with the AI, completely closing and quitting the application, reopening it, and observing that your entire conversation history is still visible on screen. You can then continue the conversation from where you left off. Additionally, you will be able to create multiple separate chat sessions (like having different notebooks for different topics), switch between them by clicking in a sidebar list, rename sessions, delete old ones, and search through your conversation history.

## Progress

- [ ] (Start date TBD) Milestone 1: Define database schema and generate migration
- [ ] (Start date TBD) Milestone 2: Implement ChatSessionStore service class with database operations
- [ ] (Start date TBD) Milestone 3: Add IPC handlers to expose database operations to UI
- [ ] (Start date TBD) Milestone 4: Build session list UI and session switching logic
- [ ] (Start date TBD) Milestone 5: Integrate message persistence into streaming workflow

## Surprises & Discoveries

(This section will be populated as implementation proceeds. Record any unexpected behaviors, performance insights, or bugs discovered during development.)

## Decision Log

- Decision: Use a five-table normalized database schema (chat_sessions, chat_messages, message_parts, tool_invocations, session_snapshots)
  Rationale: A widened relational design gives us room for growth without reworking core tables later. Sessions hold metadata and preferences, messages capture turn-level attributes, message_parts store the atomic content blocks that a renderer needs, tool_invocations capture execution telemetry, and session_snapshots keep rolling summaries for fast reloads and long-context workflows. This separation keeps write paths simple, keeps historical analytics cheap ("count tokens per session", "list failed tool runs"), and avoids JSON-blob anti-patterns where every UI view requires hydrating entire conversations.
  Date/Author: 2025-11-13 / Design review

- Decision: Treat every message part as a typed content envelope with both human-readable text and structured JSON columns
  Rationale: Future features like attachments, citations, inline tool traces, or multimodal replies all need richer metadata than a bare `content` string. By standardizing on `message_parts` rows that always include `kind`, `sequence`, `content_text`, `content_json`, `mime_type`, `size_bytes`, `status`, and `metadata_json`, we can add new part types without schema churn. The renderer can safely ignore unknown kinds while the backend continues to persist them, which is critical for forward compatibility.
  Date/Author: 2025-11-13 / Design review

- Decision: Store all timestamps as Unix integer milliseconds in the database, convert to ISO 8601 strings only when sending data to the UI
  Rationale: SQLite performs integer comparisons and sorting much faster than text comparisons. Storing timestamps as integers (milliseconds since January 1, 1970 UTC) allows efficient ordering by creation time and efficient indexing. The UI layer expects human-readable ISO 8601 strings like "2025-11-13T10:30:45.123Z", so we convert at the API boundary (inside ChatSessionStore methods before returning data). This keeps the database layer simple and performant.
  Date/Author: 2025-11-13 / Initial design

- Decision: Persist user messages immediately when sent, but persist assistant messages only after streaming completes
  Rationale: User messages are complete the moment the user presses send, so we save them immediately to the database. Assistant messages arrive as a stream of chunks over several seconds. If we saved every chunk, we would perform dozens of database writes per message and deal with complex partial-message recovery logic if streaming fails. Instead, we accumulate chunks in memory during streaming and save the complete message in one transaction when the aiChatEnd event fires. This simplifies the persistence layer and ensures we only store complete, valid messages.
  Date/Author: 2025-11-13 / Initial design

- Decision: Record tool calls and tool results in a dedicated tool_invocations table that links back to the originating message_parts
  Rationale: Tool execution is now modeled as a lifecycle with a single UUID shared across the assistant request, the invocation part that appears in the transcript, and the eventual result part. Persisting the lifecycle in `tool_invocations` lets us atomically track statuses, latency, arguments, outputs, and failure reasons without bloating the message_parts table or running UPDATE storms. It also keeps conceptual parity between analytics queries ("show me slowest tools") and UI hydration (simply join back through part ids).
  Date/Author: 2025-11-13 / Design review

## Outcomes & Retrospective

(This section will be updated at the completion of each milestone and at final completion. Summarize what was achieved, what challenges were encountered, and lessons learned.)

## Context and Orientation

This application is a desktop AI chat tool built with Electron. Electron is a framework that lets you build desktop apps using web technologies (HTML, CSS, JavaScript). This particular app uses React for the user interface, TypeScript for type safety, and SQLite for local data storage. The architecture has three separate processes that communicate via IPC (Inter-Process Communication, which is how Electron processes send messages to each other):

1. The **main process** (`src/main/`) runs Node.js and manages the application window, system integration, and orchestrates the other two processes.
2. The **backend process** (`src/backend/`) runs Node.js and handles all the heavy lifting: calling AI APIs, streaming responses, executing MCP tools (which are external programs that the AI can invoke to read files, search the web, etc.), and managing the database.
3. The **renderer process** (`src/renderer/src/`) runs in a browser-like environment and displays the React-based user interface that the user sees and interacts with.

Currently, the chat interface works like this: the user types a message in the renderer, which calls a function exposed by the main process via IPC to send the message to the backend. The backend calls an AI API (like Claude or GPT) and starts receiving the response as a stream of text chunks. As each chunk arrives, the backend publishes an event (specifically, an event called `aiChatChunk`) that the renderer listens for. The renderer updates the UI in real-time to show the text appearing word by word. When the stream finishes, the backend publishes an `aiChatEnd` event. The renderer accumulates all these chunks into a complete message object and displays it using a library called `@assistant-ui/react`, which provides pre-built chat UI components.

The problem is that all of this state—the messages, the chunks, the conversation history—lives only in the renderer's JavaScript memory. When you close the app, that memory is cleared and everything is lost. There is no code currently that saves anything to disk. We need to add that.

The application already has a SQLite database set up. SQLite is a file-based database (a single file on disk, usually named `app.db`) that stores structured data in tables, like a spreadsheet with multiple sheets. The database setup lives in `src/backend/db/index.ts`, which uses a library called Drizzle ORM. "ORM" stands for Object-Relational Mapping, which means it lets you work with database tables using JavaScript objects instead of writing raw SQL strings. The schema (the definition of what tables exist and what columns they have) is defined in `src/backend/db/schema.ts`. Currently, there is only one table called `settings`, which stores application configuration as key-value pairs.

We will add five new tables to this schema, each with explicit columns for future growth:
- `chat_sessions`: Represents a single conversation thread. Besides the basics (id, title, created_at, updated_at, provider/model ids, message_count), the row now tracks `last_message_at`, `archived_at`, `pinned_at`, a nullable `summary` blob plus `summary_updated_at`, a `color` swatch, and a `metadata_json` column for arbitrary per-session preferences. These additions support features such as pinning, archiving, color-coding, and cached summaries without more schema churn.
- `chat_messages`: Represents one conversational turn. Every row stores `sequence` (monotonic per session for deterministic ordering), `state` (`pending`, `streaming`, `completed`, `error`), `parent_message_id` (for regenerations), token counts, and a `metadata_json` column. Having a `deleted_at` column lets us implement soft-deletes or user-facing undo in a future milestone.
- `message_parts`: Represents the atomic pieces rendered in the UI. Each part has a `kind` (`text`, `tool_invocation`, `tool_result`, `attachment`, `metadata`), a `sequence` within its parent message, `content_text`, `content_json`, `mime_type`, `size_bytes`, `status`, `tool_call_id`, `tool_name`, `error_code`, `error_message`, `related_part_id`, and `metadata_json`. This uniform envelope means we can store mixed content such as streaming deltas, inline citations, or future voice attachments without schema rewrites.
- `tool_invocations`: Records the lifecycle of a tool execution. It links to the session, the owning message, and the invocation/result parts (so analytics queries never have to parse JSON blobs). Columns such as `input_json`, `output_json`, `status`, `error_code`, `latency_ms`, `started_at`, and `completed_at` prepare us for dashboards like "which tools fail most often" or "how long do migrations take."
- `session_snapshots`: Stores rolling summaries of a session at specific checkpoints. Fields include `kind` (`title`, `summary`, `memory`), `content_json`, `message_cutoff_id`, `token_count`, and timestamps. This table unlocks later enhancements such as instant session previews, background summarization, or warm-starting a long conversation without replaying every message.

These tables are connected by foreign keys. For example, each message has a `session_id` column that references a row in `chat_sessions`. When you delete a session, SQLite will automatically delete all associated messages, parts, tool invocations, and snapshots because we will configure the foreign keys with `ON DELETE CASCADE`.

Migrations are SQL files that modify the database schema. When you add new tables or columns, you generate a migration file (a file containing SQL like `CREATE TABLE ...`) using a command (`pnpm run drizzle-kit generate`). The next time the app starts, the code in `src/backend/db/index.ts` automatically applies any unapplied migrations by calling a function called `migrate()`. This ensures the database schema is always up to date. Migration files live in `resources/db/migrations/` and are included in the packaged app so they work in production.

The relevant files you will be working with are:
- `src/backend/db/schema.ts`: Define the new tables here using Drizzle's schema definition syntax.
- `resources/db/migrations/`: Drizzle generates SQL migration files here when you run the generate command.
- `src/backend/db/index.ts`: Already calls `migrate()` on startup; no changes needed, but good to understand.
- `src/backend/session/` (new directory): You will create `ChatSessionStore.ts` here, a class that provides methods like `createSession`, `addMessage`, `getSession`, etc., wrapping all the database queries.
- `src/main/index.ts` or `src/main/handlers/` (may need to create): Register IPC handlers that the renderer can call to invoke ChatSessionStore methods.
- `src/preload/index.ts`: Expose the IPC methods to the renderer as `window.api.createChatSession(...)`, etc.
- `src/renderer/src/components/` (new files): Create `SessionList.tsx` (shows all sessions in a sidebar), `ChatPanel.tsx` (wraps the chat interface with a header showing session info), and related UI components.
- `src/renderer/src/contexts/SessionManager.tsx` (new file): A React Context that holds the current session state and provides functions to switch sessions, create new ones, etc.
- `src/backend/ai/stream.ts`: The file that orchestrates AI streaming. You will add hooks here to call `chatSessionStore.updateToolCallResult(...)` when tool results arrive.
- `src/renderer/src/lib/useAIStream.ts` (or similar): The React hook that listens to streaming events. You will add code here to call `window.api.addChatMessage(...)` when the user sends a message and when the AI finishes responding.

The development database file is located at `./tmp/db/app.db` (relative to the project root). You can inspect it using the `sqlite3` command-line tool (if installed) to run queries and verify data is being saved correctly.

Terms you need to know:
- **Session**: A single conversation thread, like one notebook in a set of notebooks. Has a unique ID and contains multiple messages.
- **Message**: One turn in the conversation. Has a role (user, assistant, or system) and contains one or more parts.
- **Message Part**: A component of a message. Can be text (plain content) or a tool call (an instruction for the AI to run a tool).
- **Tool Call**: An invocation of an MCP tool. For example, if the user asks "What's in README.md?" the AI might emit a tool call with tool name "filesystem_read" and arguments `{ path: "README.md" }`.
- **Tool Call Result**: The output from running a tool. Stored separately because it arrives asynchronously after the tool executes.
- **Streaming**: The process of receiving AI responses incrementally. Instead of waiting 10 seconds for the full response, chunks arrive every few milliseconds and the UI updates in real-time.
- **IPC (Inter-Process Communication)**: How Electron processes talk to each other. The renderer calls `ipcRenderer.invoke('someMethod', arg)` and the main process handles it with `ipcMain.handle('someMethod', handler)`.
- **Drizzle ORM**: A TypeScript library for working with databases. You define tables as JavaScript objects and it generates type-safe query builders.
- **Unix timestamp**: An integer representing milliseconds since January 1, 1970 UTC. For example, 1700000000000 represents a specific date and time. SQLite stores these as integers for efficiency.
- **ISO 8601**: A human-readable date format like "2025-11-13T10:30:45.123Z". The UI prefers this format, so we convert from Unix timestamps when sending data to the renderer.

## Plan of Work

We will implement this feature through five milestones. Each milestone builds on the previous one and can be independently tested and verified before moving forward.

### Milestone 1: Database Schema and Migration

The goal of this milestone is to define the four new database tables in code and generate a migration file that will create them in the SQLite database. At the end of this milestone, the database will have the new tables but they will be empty, and no code will be using them yet. You will verify success by inspecting the database with the sqlite3 command-line tool to see that the tables exist with the correct columns and indexes.

Open the file `src/backend/db/schema.ts`. This file currently imports functions from `drizzle-orm/sqlite-core` (like `sqliteTable`, `text`, `integer`) and exports one table definition called `settings`. You will add four new table definitions to this file.

Start with the `chatSessions` table. Define it using the `sqliteTable` function, which takes a table name (a string) and an object describing the columns. Each column is defined by calling a function like `text(columnName)` or `integer(columnName)` followed by constraint methods like `.primaryKey()` or `.notNull()`. For example, the `id` column is a text column that serves as the primary key: `id: text('id').primaryKey()`. The `title` column is required text: `title: text('title').notNull()`. Timestamps are integers: `createdAt: integer('created_at').notNull()`. Note the column names use snake_case in the database (underscores between words) even though the JavaScript property names use camelCase. This is a convention in SQL databases.

The `chatSessions` table needs the following columns: `id` (text primary key), `title` (text not null), `createdAt` (integer not null), `updatedAt` (integer not null), `providerConfigId` (text, nullable), `modelId` (text, nullable), `dataSchemaVersion` (integer not null, default 1), `messageCount` (integer not null, default 0).

Next, define the `chatMessages` table. This table has a foreign key relationship to `chatSessions`. The `sessionId` column references the `id` column in `chatSessions`, and when a session is deleted, all its messages should be deleted automatically. You express this with `.references(() => chatSessions.id, { onDelete: 'cascade' })`. The `role` column stores one of three strings: 'user', 'assistant', or 'system'. We store it as plain text, but you can add a comment in the code to document the allowed values. The `error` column is text that stores a JSON string representing any error that occurred during message generation.

The `chatMessages` table columns: `id` (text primary key), `sessionId` (text not null, references chatSessions.id with cascade delete), `role` (text not null), `createdAt` (integer not null), `completedAt` (integer, nullable), `inputTokens` (integer, nullable), `outputTokens` (integer, nullable), `error` (text, nullable, stores JSON), `parentMessageId` (text, nullable, self-referencing chatMessages.id with set null on delete, for future branching support).

Define the `messageParts` table. This table stores individual parts of messages. Each part has a `type` column that is either 'text' or 'tool_call'. Text parts have a `content` column with the actual text. Tool call parts have `toolCallId`, `toolName`, `toolInput` (JSON string), and `toolInputText` (formatted for display). The table has foreign keys to both `chatMessages` (via `messageId`) and `chatSessions` (via `sessionId`) with cascade deletes.

The `messageParts` table columns: `id` (text primary key), `messageId` (text not null, references chatMessages.id cascade), `sessionId` (text not null, references chatSessions.id cascade), `type` (text not null), `createdAt` (integer not null), `updatedAt` (integer not null), `content` (text, nullable), `toolCallId` (text, nullable), `toolName` (text, nullable), `toolInput` (text, nullable, JSON string), `toolInputText` (text, nullable), `metadata` (text, nullable, JSON string).

Define the `toolCallResults` table. Each row stores the outcome of executing one tool. The `partId` column is unique and references `messageParts.id`. The `toolCallId` is also unique and serves as the join key when relating parts to results. The `status` column is either 'success' or 'error'. The `output` column stores the tool's return value as a JSON string.

The `toolCallResults` table columns: `id` (text primary key), `partId` (text not null unique, references messageParts.id cascade), `messageId` (text not null, references chatMessages.id cascade), `sessionId` (text not null, references chatSessions.id cascade), `toolCallId` (text not null unique), `toolName` (text not null), `output` (text, nullable, JSON string), `status` (text not null), `error` (text, nullable), `errorCode` (text, nullable), `startedAt` (integer, nullable), `completedAt` (integer, nullable), `createdAt` (integer not null), `updatedAt` (integer not null).

After defining the tables, define indexes. Indexes speed up queries. We will query messages by session_id frequently (to load all messages in a session), so create an index on `chatMessages.sessionId`. We will also sort messages by creation time, so index `chatMessages.createdAt`. For parts, index `messageId`, `sessionId`, and `toolCallId`. For tool results, index `messageId` and `toolName`. Drizzle provides an `index` function that you call like `index('index_name').on(tableName.columnName)` and export as a separate constant.

Once you have added all four table definitions and the indexes to `src/backend/db/schema.ts`, save the file. Do not modify `src/backend/db/index.ts` or any other files yet.

Now generate the migration. Open a terminal in the project root directory (the directory containing `package.json`). Run the command `pnpm run drizzle-kit generate`. Drizzle Kit will compare your schema definition to the current database state (which has only the settings table) and generate SQL statements to create the new tables. It will create a new file in `resources/db/migrations/` with a name like `0001_add_chat_tables.sql` containing CREATE TABLE and CREATE INDEX statements. You will see output like "Migration created: 0001_add_chat_tables.sql".

Start the application with `pnpm run dev`. The backend process will initialize the database connection and call `migrate()`, which reads the migration files and applies any that haven't been applied yet. Check the terminal logs for a message like "[backend:db] Applied migration: 0001_add_chat_tables" (the exact format depends on the logging configuration, but you should see confirmation that a migration ran).

Verify the tables were created. If you have the `sqlite3` command-line tool installed, run `sqlite3 ./tmp/db/app.db ".tables"` and you should see: `chat_messages  chat_sessions  message_parts  settings  tool_call_results`. Run `sqlite3 ./tmp/db/app.db ".schema chat_sessions"` and you should see the CREATE TABLE statement with all the columns. If you don't have sqlite3 installed, you can use Drizzle Studio by running `pnpm run drizzle-kit studio`, which opens a web interface where you can browse the database. Alternatively, you can verify in the next milestone by writing code that queries the tables.

At the end of this milestone, you have four new empty tables in the database and a migration file checked into the repository. The migration will automatically apply in production builds, so this change is deployment-ready even though no code uses the tables yet.

### Milestone 2: ChatSessionStore Service Class

The goal of this milestone is to create a service class that wraps all database operations related to chat sessions. At the end of this milestone, you will have a file `src/backend/session/ChatSessionStore.ts` exporting a class with methods like `createSession`, `addMessage`, `getSession`, etc., and a test file proving that these methods correctly read and write the database. No UI or IPC integration yet—this is purely backend logic.

Create a new directory `src/backend/session/` (create the `session` folder inside `src/backend/`). Inside it, create a file `ChatSessionStore.ts`.

At the top of the file, import the necessary dependencies:
- Import `Database` type from `better-sqlite3` (this is the type of the database connection object).
- Import the table definitions and Drizzle query functions: `import { chatSessions, chatMessages, messageParts, toolCallResults } from '../db/schema'` and `import { eq, desc, like, and } from 'drizzle-orm'` (these are query builder functions).
- Import or define the TypeScript interfaces for requests and responses (CreateSessionRequest, AddMessageRequest, ChatSessionWithMessages, etc.). You can define them in this file or in a separate types file like `src/common/chat-types.ts`.

Define the class: `export class ChatSessionStore { constructor(private db: Database) {} }`. The `db` parameter is the Drizzle database instance, which will be passed in when the class is instantiated.

Implement the `createSession` method. This method takes a `CreateSessionRequest` (an object with optional `title`, `providerConfigId`, and `modelId` fields) and returns a Promise that resolves to the new session ID (a string). Inside the method, generate a new UUID using `crypto.randomUUID()` (available in Node.js). Get the current time as a Unix timestamp with `Date.now()` (this returns milliseconds since epoch). Insert a row into the `chatSessions` table using Drizzle's insert syntax: `await this.db.insert(chatSessions).values({ id: newId, title: title || 'New Chat', createdAt: now, updatedAt: now, ... })`. Handle errors by wrapping in try/catch and returning an appropriate error object or throwing an exception. Return the new session ID on success.

Implement the `getSession` method. This method takes a session ID string and returns a Promise resolving to a `ChatSessionWithMessages` object (or null if the session doesn't exist). This is the most complex query because you need to join across all four tables. First, fetch the session row: `const session = await this.db.select().from(chatSessions).where(eq(chatSessions.id, sessionId)).get()`. If null, return null immediately. Next, fetch all messages for this session: `const messages = await this.db.select().from(chatMessages).where(eq(chatMessages.sessionId, sessionId)).orderBy(desc(chatMessages.createdAt))`. For each message, fetch its parts: `const parts = await this.db.select().from(messageParts).where(eq(messageParts.messageId, message.id))`. For each part that is a tool_call, fetch the result if it exists: `const result = await this.db.select().from(toolCallResults).where(eq(toolCallResults.toolCallId, part.toolCallId)).get()`. Combine all this data into the nested structure expected by the UI (ChatMessageWithParts arrays containing TextPart and ToolCallPart objects). Convert all Unix integer timestamps to ISO 8601 strings using a helper function (create a private method `unixToISO(timestamp: number): string` that calls `new Date(timestamp).toISOString()`). Parse any JSON string fields (like `toolInput`, `output`, `error`) into objects. Return the complete session object.

Implement the `listSessions` method. This method takes optional parameters (limit, offset, sortBy) and returns an array of session metadata (not including messages). Query the `chatSessions` table, apply ordering based on the `sortBy` parameter (default to `updatedAt` descending), apply limit and offset if provided, convert timestamps to ISO 8601, and return the array.

Implement the `addMessage` method. This method takes an `AddMessageRequest` containing session ID, role, an array of parts, and optional token counts and error info. It must insert one row into `chatMessages` and one or more rows into `messageParts` in a single transaction to ensure data consistency. Use Drizzle's transaction API: `await this.db.transaction(async (tx) => { ... })`. Inside the transaction, generate a message ID, insert the message row, loop over the parts array and insert each part, and update the session's `messageCount` and `updatedAt` fields. Return the new message ID. If any operation fails, the transaction will automatically roll back.

Implement the `updateToolCallResult` method. This method takes an `UpdateToolCallResultRequest` containing a tool call ID, output, status, and optional error info. It inserts or updates a row in the `toolCallResults` table. First, check if a result already exists for this `toolCallId`. If yes, update it; if no, insert a new row. Set the `completedAt` timestamp to now. Handle JSON serialization of the output field.

Implement the `deleteSession` method. This method takes a session ID and deletes the session row. Because foreign keys are configured with CASCADE, this will automatically delete all associated messages, parts, and results. Simply execute `await this.db.delete(chatSessions).where(eq(chatSessions.id, sessionId))`.

Implement the `updateSession` method for updating session metadata (like title). Execute `await this.db.update(chatSessions).set({ title: newTitle, updatedAt: Date.now() }).where(eq(chatSessions.id, sessionId))`.

Implement the `deleteMessagesAfter` method for deleting messages from a certain point onward (used when the user wants to edit a message and regenerate the response). Delete from `chatMessages` where `sessionId` matches and `createdAt` is greater than the creation time of the specified message. Recalculate the session's `messageCount` by counting remaining messages.

Implement the `getLastSessionId` and `setLastSessionId` methods. These store the last active session ID in the `settings` table (the existing key-value table). Use the key `'lastSessionId'`. Query or update the settings table accordingly.

Create a test file `src/backend/session/ChatSessionStore.test.ts`. Import the ChatSessionStore class and Vitest test functions (`describe`, `it`, `expect`, `beforeEach`). In a `beforeEach` hook, create an in-memory SQLite database (use `new Database(':memory:')` from better-sqlite3) and initialize it with the schema by running the table creation SQL (you can copy the SQL from the generated migration file or programmatically create tables using Drizzle's migrate function). Instantiate a ChatSessionStore with the test database.

Write test cases:
- Test `createSession`: call the method, verify it returns a UUID, query the database directly to verify the row exists.
- Test `getSession` with a non-existent ID: verify it returns null.
- Test `addMessage`: create a session, add a message with text and tool_call parts, call `getSession`, verify the returned object includes the message with both parts.
- Test `updateToolCallResult`: add a message with a tool call, update the result, call `getSession`, verify the result is attached to the tool call part.
- Test `deleteSession`: create a session, add messages, delete the session, verify the session and messages are gone.
- Test cascade delete: create a session with messages, parts, and results, delete the session, verify all related rows are deleted from all tables.
- Test `listSessions`: create multiple sessions, list them, verify they are sorted correctly.

Run the tests with `pnpm run test:backend`. You should see output like "✓ ChatSessionStore › creates a session and returns UUID" for each passing test. If any tests fail, fix the implementation until all pass.

At the end of this milestone, you have a fully functional data access layer with test coverage. The rest of the application doesn't know about it yet, but the foundation is solid.

### Milestone 3: IPC Handlers and Preload Exposure

The goal of this milestone is to expose the ChatSessionStore methods to the renderer via Electron's IPC system. At the end of this milestone, you will be able to open the app, open the browser DevTools console, and call functions like `await window.api.createChatSession({ title: 'Test' })` and see them succeed and modify the database.

Electron's IPC system works in three parts: the main process registers handlers with `ipcMain.handle`, the preload script exposes methods to the renderer via `contextBridge.exposeInMainWorld`, and the renderer calls them as `window.api.methodName()`.

Open `src/main/index.ts` (or if the file is very long, create a new file `src/main/handlers/session.ts` and import it from index.ts). Import the database instance and the ChatSessionStore. Instantiate the store: `const chatSessionStore = new ChatSessionStore(db)` (you'll need to export the `db` instance from `src/backend/db/index.ts` if it isn't already).

Register IPC handlers using `ipcMain.handle`. For each ChatSessionStore method, create a corresponding handler. For example:

    ipcMain.handle('createChatSession', async (event, request: CreateSessionRequest) => {
      try {
        const sessionId = await chatSessionStore.createSession(request)
        return { success: true, data: sessionId }
      } catch (error) {
        return { success: false, error: { message: error.message } }
      }
    })

Repeat for `listChatSessions`, `getChatSession`, `updateChatSession`, `deleteChatSession`, `searchChatSessions`, `addChatMessage`, `updateToolCallResult`, `deleteMessagesAfter`, `getLastSessionId`, `setLastSessionId`. Each handler extracts parameters from the `event` and additional arguments, calls the store method, and returns a result object with `{ success: true, data: ... }` or `{ success: false, error: ... }`.

Open `src/preload/index.ts`. This file uses `contextBridge.exposeInMainWorld` to create a `window.api` object that the renderer can access. Inside the exposed API object, add methods that call `ipcRenderer.invoke` for each handler. For example:

    api: {
      // ... existing methods
      createChatSession: (request: CreateSessionRequest) => ipcRenderer.invoke('createChatSession', request),
      listChatSessions: (options?: ListOptions) => ipcRenderer.invoke('listChatSessions', options),
      getChatSession: (sessionId: string) => ipcRenderer.invoke('getChatSession', sessionId),
      updateChatSession: (sessionId: string, updates: Partial<SessionUpdates>) => ipcRenderer.invoke('updateChatSession', sessionId, updates),
      deleteChatSession: (sessionId: string) => ipcRenderer.invoke('deleteChatSession', sessionId),
      searchChatSessions: (query: string) => ipcRenderer.invoke('searchChatSessions', query),
      addChatMessage: (request: AddMessageRequest) => ipcRenderer.invoke('addChatMessage', request),
      updateToolCallResult: (request: UpdateToolCallResultRequest) => ipcRenderer.invoke('updateToolCallResult', request),
      deleteMessagesAfter: (sessionId: string, messageId: string) => ipcRenderer.invoke('deleteMessagesAfter', sessionId, messageId),
      getLastSessionId: () => ipcRenderer.invoke('getLastSessionId'),
      setLastSessionId: (sessionId: string) => ipcRenderer.invoke('setLastSessionId', sessionId)
    }

Add TypeScript type definitions for these methods in `src/preload/index.d.ts` so the renderer gets type checking and autocomplete.

Verify the handlers work. Start the app with `pnpm run dev`. Once the window opens, press F12 (or Ctrl+Shift+I on Windows/Linux, Cmd+Option+I on Mac) to open the DevTools console. In the console, run:

    await window.api.createChatSession({ title: 'Test Session' })

You should see output like `{ success: true, data: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' }`. The UUID will be different each time. Now run:

    await window.api.listChatSessions()

You should see output like `{ success: true, data: [{ id: 'f47ac10b-...', title: 'Test Session', createdAt: '2025-11-13T10:30:00.123Z', ... }] }`.

Verify the data is in the database by running (in a separate terminal):

    sqlite3 ./tmp/db/app.db "SELECT id, title FROM chat_sessions"

You should see a row with the session you just created.

Test the `addChatMessage` method from the console:

    await window.api.addChatMessage({
      sessionId: 'f47ac10b-...',
      role: 'user',
      parts: [{ type: 'text', content: 'Hello world' }]
    })

Verify it returns a message ID. Query the database:

    sqlite3 ./tmp/db/app.db "SELECT role, content FROM chat_messages JOIN message_parts ON chat_messages.id = message_parts.message_id"

You should see `user|Hello world`.

At the end of this milestone, the renderer can call all database operations via `window.api`. No UI components use these methods yet, but the plumbing is complete and testable.

### Milestone 4: Session List UI and Session Management

The goal of this milestone is to build the user interface for viewing, creating, and switching between chat sessions. At the end of this milestone, you will have a sidebar on the left showing a list of sessions, a "New Chat" button, and the ability to click a session to switch to it. The current conversation will save and restore when you switch sessions. You will verify this by creating multiple sessions, sending messages in each, switching between them, and restarting the app to see that all sessions persist.

Create the `SessionManager` React context. Create a file `src/renderer/src/contexts/SessionManager.tsx`. This context will hold the global state related to sessions: the current session ID, the list of all sessions, and the current session's full data (with messages). Define an interface for the context value:

    interface SessionManagerContextValue {
      currentSessionId: string | null
      sessions: ChatSessionRow[]
      currentSession: ChatSessionWithMessages | null
      isLoading: boolean
      createSession: (title?: string) => Promise<void>
      switchSession: (sessionId: string) => Promise<void>
      deleteSession: (sessionId: string) => Promise<void>
      renameSession: (sessionId: string, title: string) => Promise<void>
      refreshSessions: () => Promise<void>
    }

Create a provider component `SessionManagerProvider` that uses React state hooks to manage these values. When the component mounts, call `window.api.getLastSessionId()` to get the last active session (if any), then call `window.api.getChatSession(sessionId)` to load it. Also call `window.api.listChatSessions()` to populate the session list. Implement the methods:
- `createSession`: call `window.api.createChatSession`, then switch to the new session.
- `switchSession`: call `window.api.getChatSession`, update `currentSession` and `currentSessionId` state, call `window.api.setLastSessionId` to save the choice.
- `deleteSession`: call `window.api.deleteChatSession`, remove the session from the list, if it was the current session then load another session or create a new one.
- `renameSession`: call `window.api.updateChatSession` with the new title, update the session in the local list state.
- `refreshSessions`: re-fetch the session list.

Wrap the entire app (or at least the chat interface) with this provider in `src/renderer/src/App.tsx`.

Create the `SessionList` component. Create a file `src/renderer/src/components/SessionList.tsx`. This component will render a sidebar showing all sessions. Use the `useContext` hook to access the SessionManager context. Map over the `sessions` array and render each session as a clickable item (could be a button or a div with onClick). Display the session title and last updated time (format the ISO 8601 string into a human-readable format using a library like `date-fns` or a simple function). Highlight the current session (check if `session.id === currentSessionId`). Add a "New Chat" button at the top that calls `createSession()`. Add a delete button next to each session (maybe a trash icon) that calls `deleteSession(session.id)` with a confirmation prompt.

Style the component with Tailwind CSS classes to make it look like a sidebar (e.g., fixed height, scrollable, border on the right, padding).

Create the `ChatPanel` component. Create a file `src/renderer/src/components/ChatPanel.tsx`. This component wraps the existing chat interface and adds a header showing the current session's title and metadata. Access the SessionManager context to get `currentSession`. If `currentSession` is null, show a loading spinner or a message like "No session loaded". If it exists, render a header div with the session title (make the title editable, perhaps on double-click or via an edit icon that opens a dialog or inline input). Below the header, render the existing chat interface component (the one from assistant-ui) and pass the current session's messages as props.

Integrate these components into the main app layout. Open `src/renderer/src/App.tsx` (or wherever the root component is). Wrap the app with `SessionManagerProvider`. Replace the existing chat interface with a layout that has two columns: on the left, render `<SessionList />`, on the right, render `<ChatPanel />`. Use Tailwind classes like `flex` and `flex-1` to make the layout responsive.

Verify the UI works. Run `pnpm run dev`. You should see a sidebar on the left (initially empty or showing one session if getLastSessionId returned one) and the chat area on the right. Click the "New Chat" button. A new session should appear in the list and become the current session. The chat area should clear (since the new session has no messages). Type a message and send it (the existing chat interface should still work; we haven't integrated message saving yet, so the message won't persist, but it should appear in the UI). Click the "New Chat" button again to create a second session. Now click on the first session in the list. The chat area should switch back to the first session (though messages won't be there yet because we haven't integrated persistence into the send flow).

Close the app completely (quit the process) and reopen it. The sidebar should show the sessions you created. Click on one and it should become the active session. The last active session should load automatically on startup.

At the end of this milestone, you have a fully functional session management UI. The only missing piece is that messages sent during a session don't get saved to the database, so when you switch sessions or restart, the messages disappear. That's what the next milestone fixes.

### Milestone 5: Message Persistence Integration

The goal of this milestone is to integrate the database persistence into the message send and receive flow, so that every message the user sends and every response the AI generates is automatically saved to the database. At the end of this milestone, you will be able to have a conversation, restart the app, and see the entire conversation history restored.

This milestone has three parts: saving user messages, saving assistant messages, and saving tool call results.

**Part 1: Save user messages immediately when sent.**

Find the code in the renderer that handles the user sending a message. This is likely in `src/renderer/src/lib/useAIStream.ts` or a similar file, or in a component that calls the AI streaming function. When the user presses send, the code typically constructs an array of message objects and calls a function like `window.api.streamAIText(messages, options)` to start the AI stream.

Modify this code to first save the user message to the database before starting the stream. Extract the user's input text, construct an `AddMessageRequest` object with `role: 'user'` and `parts: [{ type: 'text', content: userInputText }]`, and call `await window.api.addChatMessage(request)`. This returns a message ID. You can store this ID if needed, but it's not critical. Now the user message is persisted immediately.

**Part 2: Save assistant messages when streaming completes.**

During streaming, the backend publishes events like `aiChatChunk` (text chunk), `aiToolCall` (tool invocation), `aiToolResult` (tool output), and `aiChatEnd` (stream complete). The renderer listens to these events and accumulates the data in memory to build up the assistant's message incrementally for display.

Find the code that listens to these events (probably in the same file as Part 1). When the `aiChatEnd` event fires, you know the assistant message is complete. At this point, construct an `AddMessageRequest` with `role: 'assistant'` and a `parts` array containing all the parts that were streamed. For text, create a `{ type: 'text', content: accumulatedText }` part. For each tool call that occurred during streaming, create a `{ type: 'tool_call', toolCallId, toolName, input }` part. Call `await window.api.addChatMessage(request)` to save the complete assistant message.

Now when the user sends a message and the AI responds, both messages are saved to the database.

**Part 3: Save tool call results as they arrive.**

When the `aiToolResult` event fires during streaming, the backend has finished executing a tool and has the result. The renderer displays this result in the UI (usually by updating a tool call card to show the output). Modify the event handler to also call `await window.api.updateToolCallResult({ toolCallId, output, status: 'success' })` (or status: 'error' if the tool failed). This saves the result to the `tool_call_results` table immediately.

**Part 4: Load messages when switching sessions.**

When the user switches sessions (by calling `switchSession` in the SessionManager context), the code calls `window.api.getChatSession(sessionId)` which returns the full session with all messages and parts. You need to pass these messages to the chat interface component so they render. The assistant-ui library expects messages in a certain format (an array of objects with `role` and `content` properties). You may need to transform the `ChatMessageWithParts` objects returned from the API into the format the library expects. Write a helper function that maps over the messages array, and for each message, combine its parts into a single content string or a structured content object (depending on what assistant-ui requires). Pass this transformed array to the chat interface component as the initial messages.

Verify the end-to-end flow. Start the app. Create a new session. Send a message like "Hello, how are you?". Wait for the AI to respond. Check the database:

    sqlite3 ./tmp/db/app.db "SELECT role, content FROM chat_messages JOIN message_parts ON chat_messages.id = message_parts.message_id ORDER BY chat_messages.created_at"

You should see two rows: one with role 'user' and content 'Hello, how are you?', and one with role 'assistant' and the AI's response text.

Create a second session. Send a different message. Switch back to the first session. You should see the original conversation still there. Close the app completely and reopen it. The app should load the last active session automatically. You should see all the messages from your previous session.

If your AI setup includes MCP tools, send a message that triggers a tool (for example, if you have a file reading tool, ask "What's in README.md?"). After the response completes, check the tool_call_results table:

    sqlite3 ./tmp/db/app.db "SELECT tool_name, status FROM tool_call_results ORDER BY created_at DESC LIMIT 1"

You should see the tool name and status 'success'. Restart the app and verify the tool call displays correctly in the UI with its result.

At the end of this milestone, the entire persistence feature is complete. Every message, every session, and every tool execution is saved and restored automatically. The user can close the app at any time and return later to exactly where they left off.

## Concrete Steps

The following are the exact commands to run and the exact expected outputs for each milestone. All commands assume you are in the project root directory where `package.json` is located. Use a terminal (Command Prompt, PowerShell, or Terminal app) to run these commands.

**Milestone 1 Steps:**

1. Open `src/backend/db/schema.ts` in your editor. Add the four table definitions as described in the Plan of Work section. Save the file.

2. Run the migration generator:

       pnpm run drizzle-kit generate

   Expected output:

       Generating migration...
       [✓] 1 migration file created
       Migration files:
         - resources/db/migrations/0001_create_chat_tables.sql

3. Start the application:

       pnpm run dev

   Expected output (among other logs):

       [backend:db] Running migrations...
       [backend:db] Applied migration: 0001_create_chat_tables
       [backend:db] Database initialized

4. Verify tables exist:

       sqlite3 ./tmp/db/app.db ".tables"

   Expected output:

       chat_messages    chat_sessions    message_parts    settings         tool_call_results

5. Check schema of one table:

       sqlite3 ./tmp/db/app.db ".schema chat_sessions"

   Expected output:

       CREATE TABLE `chat_sessions` (
         `id` text PRIMARY KEY NOT NULL,
         `title` text NOT NULL,
         `created_at` integer NOT NULL,
         `updated_at` integer NOT NULL,
         `provider_config_id` text,
         `model_id` text,
         `data_schema_version` integer DEFAULT 1 NOT NULL,
         `message_count` integer DEFAULT 0 NOT NULL
       );

**Milestone 2 Steps:**

1. Create directory `src/backend/session/`.

2. Create file `src/backend/session/ChatSessionStore.ts` and implement the class as described.

3. Create file `src/backend/session/ChatSessionStore.test.ts` and write tests.

4. Run tests:

       pnpm run test:backend

   Expected output:

       ✓ src/backend/session/ChatSessionStore.test.ts (8)
         ✓ ChatSessionStore (8)
           ✓ creates a session and returns UUID
           ✓ returns null for non-existent session
           ✓ adds message with text part
           ✓ adds message with tool_call part
           ✓ updates tool call result
           ✓ retrieves session with messages and parts
           ✓ deletes session and cascades
           ✓ lists sessions sorted by updatedAt

       Test Files  1 passed (1)
       Tests  8 passed (8)

**Milestone 3 Steps:**

1. Open `src/main/index.ts` (or create `src/main/handlers/session.ts`). Add IPC handlers as described.

2. Open `src/preload/index.ts`. Add API methods as described. Save.

3. Start the app:

       pnpm run dev

4. Open DevTools (press F12 in the app window). In the console, run:

       await window.api.createChatSession({ title: 'Test Session' })

   Expected output:

       { success: true, data: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' }

   (The UUID will be different each time.)

5. Run:

       await window.api.listChatSessions()

   Expected output:

       { success: true, data: [
         {
           id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
           title: 'Test Session',
           createdAt: '2025-11-13T12:34:56.789Z',
           updatedAt: '2025-11-13T12:34:56.789Z',
           messageCount: 0,
           dataSchemaVersion: 1
         }
       ]}

6. Add a message:

       await window.api.addChatMessage({
         sessionId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
         role: 'user',
         parts: [{ type: 'text', content: 'Hello' }]
       })

   Expected output:

       { success: true, data: 'a1b2c3d4-5678-90ab-cdef-1234567890ab' }

7. Verify in database:

       sqlite3 ./tmp/db/app.db "SELECT role, content FROM chat_messages JOIN message_parts ON chat_messages.id = message_parts.message_id"

   Expected output:

       user|Hello

**Milestone 4 Steps:**

1. Create `src/renderer/src/contexts/SessionManager.tsx` and implement the provider.

2. Create `src/renderer/src/components/SessionList.tsx` and implement the list UI.

3. Create `src/renderer/src/components/ChatPanel.tsx` and implement the panel with header.

4. Modify `src/renderer/src/App.tsx` to wrap with `SessionManagerProvider` and lay out `SessionList` and `ChatPanel` side by side.

5. Run the app:

       pnpm run dev

   Expected behavior:
   - Window opens with a sidebar on the left (initially empty or with one session) and chat area on the right.
   - Click "New Chat" button. A new session appears in the list with title like "New Chat" or "Chat 2025-11-13".
   - The chat area updates to show the new empty session.
   - Click "New Chat" again. Another session appears.
   - Click the first session in the list. The chat area switches to that session.
   - Close the app (Ctrl+C in terminal or close the window).
   - Restart: `pnpm run dev`
   - The last active session loads automatically.
   - Both sessions appear in the sidebar.

**Milestone 5 Steps:**

1. Find the code that handles user message send (likely in `src/renderer/src/lib/useAIStream.ts` or similar). Modify it to call `window.api.addChatMessage` before starting the stream.

2. Find the code that listens to `aiChatEnd` event. Modify it to call `window.api.addChatMessage` with the complete assistant message.

3. Find the code that listens to `aiToolResult` event. Modify it to call `window.api.updateToolCallResult`.

4. Ensure `switchSession` in SessionManager loads messages and passes them to the chat interface.

5. Run the app:

       pnpm run dev

6. Create a new session or use an existing one. Send a message: "Hello, how are you?"

7. Wait for the AI to respond. Once the response is complete, check the database:

       sqlite3 ./tmp/db/app.db "SELECT role, content FROM chat_messages JOIN message_parts ON chat_messages.id = message_parts.message_id ORDER BY chat_messages.created_at"

   Expected output:

       user|Hello, how are you?
       assistant|I'm doing well, thank you for asking! How can I help you today?

   (The assistant's response text will vary depending on the AI.)

8. Create a second session. Send a message: "Test message 2".

9. Switch back to the first session. You should see the "Hello, how are you?" conversation.

10. Close the app completely (quit the process, not just minimize). Restart:

        pnpm run dev

11. The app should open with the first session loaded (since it was the last active). The messages should be visible.

12. Click on the second session in the sidebar. You should see "Test message 2".

13. If you have MCP tools configured, send a message that triggers a tool (e.g., "Read the README file"). After the response, check:

        sqlite3 ./tmp/db/app.db "SELECT tool_name, status FROM tool_call_results ORDER BY created_at DESC LIMIT 1"

    Expected output:

        filesystem_read|success

    (The tool name will vary depending on your MCP setup.)

14. Restart the app and verify the tool call displays correctly in the UI.

## Validation and Acceptance

Each milestone has its own acceptance criteria. You must verify each before proceeding to the next.

**Milestone 1 Acceptance:**

After running the migration generation and starting the app, run:

    sqlite3 ./tmp/db/app.db ".tables"

You must see `chat_sessions`, `chat_messages`, `message_parts`, and `tool_call_results` in the output.

Run:

    sqlite3 ./tmp/db/app.db ".schema chat_messages"

You must see a CREATE TABLE statement with columns `id`, `session_id`, `role`, `created_at`, `completed_at`, `input_tokens`, `output_tokens`, `error`, and `parent_message_id`, and a FOREIGN KEY referencing `chat_sessions(id)` with `ON DELETE CASCADE`.

**Milestone 2 Acceptance:**

Run:

    pnpm run test:backend

All tests in `ChatSessionStore.test.ts` must pass. The output must show "Test Files 1 passed" and "Tests X passed" with no failures.

Additionally, manually verify by opening a Node REPL or writing a small script that imports ChatSessionStore, creates an instance with the development database, creates a session, adds a message, and calls getSession to retrieve it. Print the result and verify the structure matches the expected `ChatSessionWithMessages` interface.

**Milestone 3 Acceptance:**

Start the app with `pnpm run dev`. Open DevTools (F12). Run in the console:

    const result = await window.api.createChatSession({ title: 'Acceptance Test' })
    console.log(result)

You must see `{ success: true, data: '<uuid>' }` printed. Copy the UUID. Run:

    const session = await window.api.getChatSession('<uuid>')
    console.log(session)

You must see an object with `id`, `title: 'Acceptance Test'`, `createdAt`, `updatedAt`, `messageCount: 0`, and `messages: []`.

**Milestone 4 Acceptance:**

Start the app. You must see a two-column layout with a sidebar on the left and a chat area on the right. Click "New Chat". A new session must appear in the sidebar and the chat area must clear. Create a second session. Click the first session in the list. The UI must switch to show that session. Close the app completely (quit the process). Reopen the app. The sessions must still be listed in the sidebar. Click on one and it must load.

**Milestone 5 Acceptance:**

Start the app. Send a message "Test message". Wait for the AI to respond. Close the app. Reopen the app. The last session must load automatically with the "Test message" and the AI's response visible. Send another message. Close and reopen again. Both messages and both responses must be visible.

Run:

    sqlite3 ./tmp/db/app.db "SELECT COUNT(*) FROM chat_messages"

You must see a count greater than 0. Run:

    sqlite3 ./tmp/db/app.db "SELECT COUNT(*) FROM message_parts"

You must see a count greater than or equal to the message count (since each message has at least one part).

If you have MCP tools, send a message that triggers a tool. After completion, run:

    sqlite3 ./tmp/db/app.db "SELECT COUNT(*) FROM tool_call_results WHERE status='success'"

You must see at least 1.

**Final End-to-End Acceptance:**

Perform the following test sequence:

1. Start the app. Create a session titled "Session A". Send 3 messages and wait for AI responses.
2. Create a session titled "Session B". Send 2 messages.
3. Switch back to "Session A". Verify the 3 messages are still visible.
4. Close the app completely.
5. Reopen the app. Verify "Session A" loads automatically (it was the last active).
6. Switch to "Session B". Verify the 2 messages are visible.
7. Delete "Session B" (click the delete button and confirm).
8. Verify "Session B" is no longer in the list.
9. Close and reopen the app.
10. Verify "Session B" is still gone and "Session A" is still present with all its messages.

If all these steps succeed, the feature is fully implemented and working.

## Idempotence and Recovery

The migration generated in Milestone 1 is idempotent. Drizzle tracks applied migrations in a table called `__drizzle_migrations`. If you run the app multiple times, the migration will only be applied once. If you need to reset your development database to a clean state (for example, if you made a mistake in the schema and want to start over), you can run:

    pnpm run db:reset

This command deletes the `./tmp/db/app.db` file entirely. The next time you start the app, Drizzle will create a new database and apply all migrations from scratch, giving you a fresh start.

All IPC methods can be called multiple times safely. If you call `createChatSession` with the same title twice, it will create two separate sessions with different UUIDs. Deleting a session that doesn't exist will return an error in the result object, but the app will not crash. Adding a message to a non-existent session will fail gracefully with an error.

If a database write fails partway through (for example, if the disk is full or the file is locked), the transaction will roll back and the database will remain in a consistent state. The UI should display an error message to the user and allow them to retry the operation. You can implement retry logic by catching errors in the IPC handlers and returning a specific error code, then showing a retry button in the UI.

If you encounter bugs during Milestone 5 (the streaming integration), you can temporarily disable the persistence calls (comment out the `addChatMessage` lines) to allow the app to continue functioning without persistence while you debug. This way, you can still test the chat interface without breaking the existing functionality.

If the app crashes or is force-quit while streaming, the in-progress assistant message will not be saved (since it hadn't reached the `aiChatEnd` event yet). This is acceptable—partial messages are not useful. The user can simply send the message again.

## Artifacts and Notes

The following are example outputs and code snippets to help you understand what success looks like.

**Example Migration File (Milestone 1):**

File: `resources/db/migrations/0001_create_chat_tables.sql`

    CREATE TABLE `chat_sessions` (
      `id` text PRIMARY KEY NOT NULL,
      `title` text NOT NULL,
      `created_at` integer NOT NULL,
      `updated_at` integer NOT NULL,
      `provider_config_id` text,
      `model_id` text,
      `data_schema_version` integer DEFAULT 1 NOT NULL,
      `message_count` integer DEFAULT 0 NOT NULL
    );
    CREATE TABLE `chat_messages` (
      `id` text PRIMARY KEY NOT NULL,
      `session_id` text NOT NULL,
      `role` text NOT NULL,
      `created_at` integer NOT NULL,
      `completed_at` integer,
      `input_tokens` integer,
      `output_tokens` integer,
      `error` text,
      `parent_message_id` text,
      FOREIGN KEY (`session_id`) REFERENCES `chat_sessions`(`id`) ON DELETE CASCADE,
      FOREIGN KEY (`parent_message_id`) REFERENCES `chat_messages`(`id`) ON DELETE SET NULL
    );
    CREATE INDEX `idx_chat_messages_session_id` ON `chat_messages` (`session_id`);
    CREATE INDEX `idx_chat_messages_created_at` ON `chat_messages` (`created_at`);
    -- ... (similar for message_parts and tool_call_results)

**Example Test Output (Milestone 2):**

    $ pnpm run test:backend

    > backend-tests
    > vitest run

     RUN  v0.34.0

     ✓ src/backend/session/ChatSessionStore.test.ts (8) 145ms
       ✓ ChatSessionStore (8)
         ✓ creates a session and returns UUID 12ms
         ✓ returns null for non-existent session 3ms
         ✓ adds message with text part 18ms
         ✓ adds message with tool_call part 15ms
         ✓ updates tool call result 10ms
         ✓ retrieves session with messages and parts 25ms
         ✓ deletes session and cascades 8ms
         ✓ lists sessions sorted by updatedAt 14ms

     Test Files  1 passed (1)
          Tests  8 passed (8)
       Start at  12:34:56
       Duration  1.2s

**Example IPC Call (Milestone 3):**

In the renderer DevTools console:

    > await window.api.createChatSession({ title: 'My First Session' })
    {
      success: true,
      data: 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
    }

    > await window.api.listChatSessions()
    {
      success: true,
      data: [
        {
          id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
          title: 'My First Session',
          createdAt: '2025-11-13T10:30:45.123Z',
          updatedAt: '2025-11-13T10:30:45.123Z',
          messageCount: 0,
          dataSchemaVersion: 1,
          providerConfigId: null,
          modelId: null
        }
      ]
    }

**Example Database Query (Milestone 5):**

    $ sqlite3 ./tmp/db/app.db "SELECT role, type, content, tool_name FROM chat_messages JOIN message_parts ON chat_messages.id = message_parts.message_id ORDER BY chat_messages.created_at"

    user|text|Hello, can you help me?|
    assistant|text|Of course! What do you need help with?|
    user|text|Read the README file|
    assistant|tool_call||filesystem_read
    assistant|text|The README contains: ...|

**Example Tool Result Query (Milestone 5):**

    $ sqlite3 ./tmp/db/app.db "SELECT tool_name, status, substr(output, 1, 50) FROM tool_call_results ORDER BY created_at DESC LIMIT 3"

    filesystem_read|success|{"content":"# Project Title\n\nThis is a sample RE
    web_search|success|{"results":[{"title":"Example","url":"https://ex
    calculator|error|

(The output is truncated for readability.)

## Interfaces and Dependencies

All TypeScript interfaces must be defined in `src/common/chat-types.ts` (create this file) or in `src/backend/session/types.ts` if you prefer to keep them with the store. These interfaces define the shape of the data passed between layers.

**Database Row Interfaces (Internal to ChatSessionStore):**

These represent the raw data as stored in the database, with Unix integer timestamps.

    export interface ChatSessionRow {
      id: string
      title: string
      createdAt: number  // Unix milliseconds
      updatedAt: number  // Unix milliseconds
      providerConfigId: string | null
      modelId: string | null
      dataSchemaVersion: number
      messageCount: number
    }

    export interface ChatMessageRow {
      id: string
      sessionId: string
      role: 'user' | 'assistant' | 'system'
      createdAt: number
      completedAt: number | null
      inputTokens: number | null
      outputTokens: number | null
      error: string | null  // JSON string
      parentMessageId: string | null
    }

    export interface MessagePartRow {
      id: string
      messageId: string
      sessionId: string
      type: 'text' | 'tool_call'
      createdAt: number
      updatedAt: number
      content: string | null
      toolCallId: string | null
      toolName: string | null
      toolInput: string | null  // JSON string
      toolInputText: string | null
      metadata: string | null  // JSON string
    }

    export interface ToolCallResultRow {
      id: string
      partId: string
      messageId: string
      sessionId: string
      toolCallId: string
      toolName: string
      output: string | null  // JSON string
      status: 'success' | 'error'
      error: string | null
      errorCode: string | null
      startedAt: number | null
      completedAt: number | null
      createdAt: number
      updatedAt: number
    }

**API Interfaces (Returned to Renderer, with ISO 8601 timestamps):**

    export interface ChatSessionWithMessages {
      id: string
      title: string
      createdAt: string  // ISO 8601
      updatedAt: string  // ISO 8601
      providerConfigId?: string
      modelId?: string
      dataSchemaVersion: number
      messageCount: number
      messages: ChatMessageWithParts[]
    }

    export interface ChatMessageWithParts {
      id: string
      sessionId: string
      role: 'user' | 'assistant' | 'system'
      createdAt: string  // ISO 8601
      completedAt?: string  // ISO 8601
      inputTokens?: number
      outputTokens?: number
      error?: {
        name: string
        message: string
        details?: unknown
      }
      parts: (TextPart | ToolCallPart)[]
    }

    export interface TextPart {
      type: 'text'
      id: string
      content: string
      createdAt: string  // ISO 8601
    }

    export interface ToolCallPart {
      type: 'tool_call'
      id: string
      toolCallId: string
      toolName: string
      input: unknown  // Parsed from JSON
      inputText: string
      status: 'pending' | 'success' | 'error'
      result?: {
        output?: unknown  // Parsed from JSON
        error?: string
        errorCode?: string
      }
      startedAt?: string  // ISO 8601
      completedAt?: string  // ISO 8601
    }

**Request Interfaces (Passed from Renderer to Backend):**

    export interface CreateSessionRequest {
      title?: string
      providerConfigId?: string
      modelId?: string
    }

    export interface AddMessageRequest {
      sessionId: string
      role: 'user' | 'assistant' | 'system'
      parts: AddMessagePartRequest[]
      inputTokens?: number
      outputTokens?: number
      error?: {
        name: string
        message: string
        details?: unknown
      }
    }

    export interface AddMessagePartRequest {
      type: 'text' | 'tool_call'
      // For text:
      content?: string
      // For tool_call:
      toolCallId?: string
      toolName?: string
      input?: unknown  // Will be JSON.stringify'd before storage
    }

    export interface UpdateToolCallResultRequest {
      toolCallId: string
      output?: unknown  // Will be JSON.stringify'd
      status: 'success' | 'error'
      error?: string
      errorCode?: string
    }

    export interface ListSessionsOptions {
      limit?: number
      offset?: number
      sortBy?: 'updatedAt' | 'createdAt' | 'title'
    }

**ChatSessionStore Class Signature:**

In `src/backend/session/ChatSessionStore.ts`:

    import { Database } from 'better-sqlite3'
    import { chatSessions, chatMessages, messageParts, toolCallResults } from '../db/schema'
    import { eq, desc, like, and, sql } from 'drizzle-orm'

    export class ChatSessionStore {
      constructor(private db: Database) {}

      async createSession(request: CreateSessionRequest): Promise<string> {
        // Returns the new session ID
      }

      async getSession(sessionId: string): Promise<ChatSessionWithMessages | null> {
        // Returns full session with messages, or null if not found
      }

      async listSessions(options?: ListSessionsOptions): Promise<ChatSessionRow[]> {
        // Returns array of session metadata (no messages)
      }

      async updateSession(sessionId: string, updates: Partial<Pick<ChatSessionRow, 'title' | 'providerConfigId' | 'modelId'>>): Promise<void> {
        // Updates session fields
      }

      async deleteSession(sessionId: string): Promise<void> {
        // Deletes session and all related data (cascade)
      }

      async searchSessions(query: string): Promise<ChatSessionRow[]> {
        // Searches sessions by title (uses LIKE)
      }

      async addMessage(request: AddMessageRequest): Promise<string> {
        // Adds message with parts in a transaction, returns message ID
      }

      async updateToolCallResult(request: UpdateToolCallResultRequest): Promise<void> {
        // Inserts or updates a tool call result
      }

      async deleteMessagesAfter(sessionId: string, messageId: string): Promise<void> {
        // Deletes messages created after the specified message
      }

      async getLastSessionId(): Promise<string | null> {
        // Retrieves last active session ID from settings
      }

      async setLastSessionId(sessionId: string): Promise<void> {
        // Stores last active session ID in settings
      }

      // Private helper methods:
      private unixToISO(timestamp: number): string {
        return new Date(timestamp).toISOString()
      }

      private isoToUnix(isoString: string): number {
        return new Date(isoString).getTime()
      }
    }

**IPC Handlers Registration (in `src/main/index.ts` or `src/main/handlers/session.ts`):**

    import { ipcMain } from 'electron'
    import { db } from '../backend/db'
    import { ChatSessionStore } from '../backend/session/ChatSessionStore'

    const chatSessionStore = new ChatSessionStore(db)

    function wrapResult<T>(fn: () => Promise<T>) {
      return fn()
        .then(data => ({ success: true, data }))
        .catch(error => ({ success: false, error: { message: error.message, code: error.code } }))
    }

    ipcMain.handle('createChatSession', async (event, request: CreateSessionRequest) => {
      return wrapResult(() => chatSessionStore.createSession(request))
    })

    ipcMain.handle('listChatSessions', async (event, options?: ListSessionsOptions) => {
      return wrapResult(() => chatSessionStore.listSessions(options))
    })

    ipcMain.handle('getChatSession', async (event, sessionId: string) => {
      return wrapResult(() => chatSessionStore.getSession(sessionId))
    })

    ipcMain.handle('updateChatSession', async (event, sessionId: string, updates) => {
      return wrapResult(() => chatSessionStore.updateSession(sessionId, updates))
    })

    ipcMain.handle('deleteChatSession', async (event, sessionId: string) => {
      return wrapResult(() => chatSessionStore.deleteSession(sessionId))
    })

    ipcMain.handle('searchChatSessions', async (event, query: string) => {
      return wrapResult(() => chatSessionStore.searchSessions(query))
    })

    ipcMain.handle('addChatMessage', async (event, request: AddMessageRequest) => {
      return wrapResult(() => chatSessionStore.addMessage(request))
    })

    ipcMain.handle('updateToolCallResult', async (event, request: UpdateToolCallResultRequest) => {
      return wrapResult(() => chatSessionStore.updateToolCallResult(request))
    })

    ipcMain.handle('deleteMessagesAfter', async (event, sessionId: string, messageId: string) => {
      return wrapResult(() => chatSessionStore.deleteMessagesAfter(sessionId, messageId))
    })

    ipcMain.handle('getLastSessionId', async () => {
      return wrapResult(() => chatSessionStore.getLastSessionId())
    })

    ipcMain.handle('setLastSessionId', async (event, sessionId: string) => {
      return wrapResult(() => chatSessionStore.setLastSessionId(sessionId))
    })

**Preload API Exposure (in `src/preload/index.ts`):**

    import { contextBridge, ipcRenderer } from 'electron'

    contextBridge.exposeInMainWorld('api', {
      // ... existing api methods

      // Session management
      createChatSession: (request: CreateSessionRequest) => ipcRenderer.invoke('createChatSession', request),
      listChatSessions: (options?: ListSessionsOptions) => ipcRenderer.invoke('listChatSessions', options),
      getChatSession: (sessionId: string) => ipcRenderer.invoke('getChatSession', sessionId),
      updateChatSession: (sessionId: string, updates: Partial<any>) => ipcRenderer.invoke('updateChatSession', sessionId, updates),
      deleteChatSession: (sessionId: string) => ipcRenderer.invoke('deleteChatSession', sessionId),
      searchChatSessions: (query: string) => ipcRenderer.invoke('searchChatSessions', query),

      // Message operations
      addChatMessage: (request: AddMessageRequest) => ipcRenderer.invoke('addChatMessage', request),
      updateToolCallResult: (request: UpdateToolCallResultRequest) => ipcRenderer.invoke('updateToolCallResult', request),
      deleteMessagesAfter: (sessionId: string, messageId: string) => ipcRenderer.invoke('deleteMessagesAfter', sessionId, messageId),

      // Session state
      getLastSessionId: () => ipcRenderer.invoke('getLastSessionId'),
      setLastSessionId: (sessionId: string) => ipcRenderer.invoke('setLastSessionId', sessionId)
    })

**SessionManager Context (in `src/renderer/src/contexts/SessionManager.tsx`):**

    import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

    interface SessionManagerContextValue {
      currentSessionId: string | null
      sessions: ChatSessionRow[]
      currentSession: ChatSessionWithMessages | null
      isLoading: boolean
      createSession: (title?: string) => Promise<void>
      switchSession: (sessionId: string) => Promise<void>
      deleteSession: (sessionId: string) => Promise<void>
      renameSession: (sessionId: string, title: string) => Promise<void>
      refreshSessions: () => Promise<void>
    }

    const SessionManagerContext = createContext<SessionManagerContextValue | null>(null)

    export const SessionManagerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
      const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
      const [sessions, setSessions] = useState<ChatSessionRow[]>([])
      const [currentSession, setCurrentSession] = useState<ChatSessionWithMessages | null>(null)
      const [isLoading, setIsLoading] = useState(true)

      useEffect(() => {
        // On mount, load last session
        const initialize = async () => {
          const lastIdResult = await window.api.getLastSessionId()
          if (lastIdResult.success && lastIdResult.data) {
            await switchSession(lastIdResult.data)
          } else {
            // No last session, create a new one
            await createSession()
          }
          await refreshSessions()
          setIsLoading(false)
        }
        initialize()
      }, [])

      const createSession = async (title?: string) => {
        const result = await window.api.createChatSession({ title })
        if (result.success) {
          await switchSession(result.data)
          await refreshSessions()
        }
      }

      const switchSession = async (sessionId: string) => {
        const result = await window.api.getChatSession(sessionId)
        if (result.success && result.data) {
          setCurrentSession(result.data)
          setCurrentSessionId(sessionId)
          await window.api.setLastSessionId(sessionId)
        }
      }

      const deleteSession = async (sessionId: string) => {
        await window.api.deleteChatSession(sessionId)
        await refreshSessions()
        if (currentSessionId === sessionId) {
          // Deleted current session, switch to another or create new
          if (sessions.length > 1) {
            const nextSession = sessions.find(s => s.id !== sessionId)
            if (nextSession) await switchSession(nextSession.id)
          } else {
            await createSession()
          }
        }
      }

      const renameSession = async (sessionId: string, title: string) => {
        await window.api.updateChatSession(sessionId, { title })
        await refreshSessions()
        if (currentSession && currentSession.id === sessionId) {
          setCurrentSession({ ...currentSession, title })
        }
      }

      const refreshSessions = async () => {
        const result = await window.api.listChatSessions({ sortBy: 'updatedAt' })
        if (result.success) {
          setSessions(result.data)
        }
      }

      return (
        <SessionManagerContext.Provider value={{
          currentSessionId,
          sessions,
          currentSession,
          isLoading,
          createSession,
          switchSession,
          deleteSession,
          renameSession,
          refreshSessions
        }}>
          {children}
        </SessionManagerContext.Provider>
      )
    }

    export const useSessionManager = () => {
      const context = useContext(SessionManagerContext)
      if (!context) throw new Error('useSessionManager must be used within SessionManagerProvider')
      return context
    }

This completes the interface specifications. Follow the milestones in order, implementing the interfaces as described, and testing at each step. Each milestone builds on the previous, and you can verify correctness by running the commands and checks listed in the Concrete Steps and Validation sections.
