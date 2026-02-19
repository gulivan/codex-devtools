# Codex DevTools — Unified Adaptation Plan

> Comprehensive mapping from **claude-devtools** to **codex-devtools**.
> Merged from deep analysis of both codebases and Codex JSONL session logs.

---

## Table of Contents

1. [Service Mapping](#1-service-mapping)
2. [Type Mapping](#2-type-mapping)
3. [Renderer Adaptation](#3-renderer-adaptation)
4. [Project Structure](#4-project-structure)
5. [Features Not Needed in v1](#5-features-not-needed-in-v1)
6. [Build System Adaptation](#6-build-system-adaptation)
7. [Migration Checklist](#7-migration-checklist)

---

## 1. SERVICE MAPPING

### 1.1 Discovery Layer

#### ProjectScanner -> CodexSessionScanner

| Aspect | claude-devtools | codex-devtools |
|--------|----------------|----------------|
| **Root path** | `~/.claude/projects/{encoded-path}/` | `~/.codex/sessions/{YYYY}/{MM}/{DD}/` |
| **Session files** | `{uuid}.jsonl` | `rollout-{date}T{time}-{uuid}.jsonl` |
| **Project grouping** | Encoded directory name -> project | Extract `cwd` from `session_meta` -> group by CWD |
| **Date grouping** | File `birthtimeMs` | Directory hierarchy `YYYY/MM/DD` |
| **Session ID** | UUID extracted from filename | Prefer `session_meta.payload.id`; fallback to UUID extracted from filename suffix |
| **Subagent files** | `{uuid}/{agent_uuid}.jsonl` | **NOT APPLICABLE** -- no subagents |

**CodexSessionScanner** responsibilities:
- Walk `~/.codex/sessions/YYYY/MM/DD/` directories
- Parse `rollout-*.jsonl` filenames to extract date + UUID
- Read first line (`session_meta`) of each file for metadata
- Group sessions by `session_meta.payload.cwd` to synthesize "projects"
- Build session list sorted by date (from directory path + timestamp)
- Cursor-based pagination using `(timestamp, sessionId)` pair

**Discovery behavior:**
- Source of truth: filesystem date tree under `~/.codex/sessions`.
- Workspace grouping key: `session_meta.payload.cwd`.
- Session ID: prefer `session_meta.payload.id`; fallback to filename UUID segment.
- If `session_meta` is missing/invalid: fallback CWD from first `turn_context.payload.cwd`.
- If `session_meta` is entirely absent (truncated file): skip session with warning log, do not crash.

**Key differences from claude-devtools:**
- No encoded path system needed -- CWD comes directly from `session_meta`
- Project ID = hash or normalized form of CWD path
- Session date is embedded in both the directory structure AND the filename
- No separate `todos/` directory

#### SubagentResolver -> NOT NEEDED

Codex CLI does not spawn subagents. All tool calls are sequential within a single session.
Remove entirely: `SubagentResolver`, `SubagentLocator`, `SubagentDetailBuilder`, `ProcessLinker`.

#### WorktreeGrouper -> NOT NEEDED (v1)

No worktree/repository grouping in v1. Sessions grouped by CWD only.

#### SessionSearcher -> CodexSessionSearcher

Same concept -- full-text search across session files. Adapt to:
- Search `event_msg.user_message.message` for user text
- Search `event_msg.agent_message.message` for agent text
- Search `response_item[message].content[].text` for full message content
- Search `response_item[function_call].arguments` for tool invocations

#### SessionContentFilter -> CodexSessionContentFilter

Noise filtering adapted for Codex format:
- Filter `token_count` events from conversation display (metrics only)
- Filter `turn_context` lines from conversation display (context panel only)
- Filter `reasoning` items based on user preference (show/hide thinking)
- Always show: `user_message`, `agent_message`, `function_call`, `function_call_output`, `custom_tool_call`, `custom_tool_call_output`

#### SessionFilter -> CodexSessionFilter

Workspace-level filtering: hide/pin sessions, filter by collaboration mode, date range, model.

---

### 1.2 Parsing Layer

#### SessionParser -> CodexSessionParser

| Aspect | claude-devtools | codex-devtools |
|--------|----------------|----------------|
| **File format** | Claude JSONL (type at root) | Codex JSONL (`{timestamp, type, payload}` envelope) |
| **Entry types** | user, assistant, system, summary, file-history-snapshot | session_meta, response_item, turn_context, event_msg, compacted |
| **Message envelope** | Flat with `type` field | Nested `payload` with `payload.type` subtype |
| **Token data** | `usage` on assistant messages | Separate `event_msg.token_count` lines |
| **Thinking** | `ThinkingContent` blocks inline | Separate `reasoning` response_items |

**Parsing pipeline:**

```
1. Read file line by line
2. First line -> session_meta -> CodexSessionMeta
   - If missing/invalid: fallback CWD from first turn_context
3. Remaining lines -> classify by type:
   - response_item -> further classify by payload.type
   - turn_context -> accumulate context changes
   - event_msg -> further classify by payload.type
   - compacted -> track compaction events
4. Link function_call <-> function_call_output by call_id
5. Link custom_tool_call <-> custom_tool_call_output by call_id
6. Delineate turns using task_started/task_complete events
7. Compute metrics from token_count events
```

#### EntryParser -> CodexEntryParser

Parses individual JSONL lines into typed `CodexLogEntry` objects. Handles malformed lines gracefully (log warning, skip line). Validates the `{timestamp, type, payload}` envelope before dispatching to type-specific parsers.

#### MessageClassifier -> CodexMessageClassifier

| claude-devtools category | codex-devtools equivalent |
|--------------------------|---------------------------|
| `user` (real user input) | `event_msg.user_message` OR `response_item[message, role=user]` |
| `system` (command output) | `response_item[function_call_output]` OR `response_item[custom_tool_call_output]` |
| `ai` (assistant response) | `event_msg.agent_message` OR `response_item[message, role=assistant]` |
| `hardNoise` (filtered) | `event_msg.token_count` (display-only noise), `turn_context` (metadata only) |
| `compact` | `compacted` top-level type OR `event_msg.context_compacted` |

**Classification rules for Codex:**

```typescript
type CodexMessageCategory =
  | 'user'           // User messages
  | 'developer'      // Developer/system prompt messages
  | 'assistant'      // Agent responses
  | 'toolCall'       // Function calls (shell_command, apply_patch, etc.)
  | 'toolResult'     // Function call outputs
  | 'reasoning'      // Agent thinking/reasoning
  | 'turnEvent'      // Turn lifecycle (task_started, task_complete, etc.)
  | 'compact'        // Compaction markers
  | 'noise';         // token_count, turn_context (metrics only)
```

---

### 1.3 Analysis Layer

#### ChunkBuilder -> CodexChunkBuilder

Simplified since there are no subagents. Chunks are built from turn boundaries.

**Turn delineation strategy:**
1. `event_msg[task_started]` opens a new turn
2. All `response_item` and `event_msg` lines between task_started and task_complete/turn_aborted belong to that turn
3. `event_msg[task_complete]` or `event_msg[turn_aborted]` closes the turn
4. Fallback: if no task_started events, delineate by `event_msg[user_message]` boundaries

**Chunk building pipeline:**

```
user_message -> UserChunk
  |
task_started -> begin AIChunk
  reasoning -> ThinkingStep
  function_call -> ToolCallStep
  function_call_output -> ToolResultStep
  custom_tool_call -> ToolCallStep
  custom_tool_call_output -> ToolResultStep
  agent_message -> OutputStep
  message[role=assistant] -> OutputStep
task_complete -> close AIChunk
  |
Next user_message -> next UserChunk
```

**Key simplification:** No `Process[]` array on AIChunk (no subagents). No `sidechainMessages`. No parallel detection.

#### ToolExecutionBuilder -> CodexToolExecutionBuilder

Links tool calls to their outputs via `call_id`.

**Linking algorithm:**
1. Collect all `function_call` / `custom_tool_call` items -> Map by `call_id`
2. Collect all `function_call_output` / `custom_tool_call_output` items -> match by `call_id`
3. Compute duration from timestamp difference
4. Parse `output` JSON for exit_code to determine error status

**Tool name taxonomy (observed in logs):**
- `shell_command` -- Shell execution with `{command, workdir}` args
- `apply_patch` -- File patch application (custom_tool_call)
- `web_search_call` -- Web search (separate response_item type)

#### TurnBuilder -> CodexTurnBuilder

Delineates turns using `task_started` / `task_complete` / `turn_aborted` events. Each turn aggregates its tool executions, reasoning steps, and final agent message.

#### SemanticStepExtractor -> CodexSemanticStepExtractor

Simplified extraction -- no subagent context:

```typescript
type CodexSemanticStepType =
  | 'reasoning'    // From reasoning response_items
  | 'tool_call'    // From function_call / custom_tool_call
  | 'tool_result'  // From function_call_output / custom_tool_call_output
  | 'output'       // From agent_message or assistant messages
  | 'interruption'; // From turn_aborted

// No 'subagent' step type needed
```

#### WaterfallBuilder -> CodexWaterfallBuilder (v2)

Defer to v2. Turn-based timeline is simpler without parallel subagents.

---

### 1.4 Infrastructure Layer

#### DataCache -- Adapt paths

Same LRU cache strategy. Change cache key format:
- claude: `{projectId}-{sessionId}`
- codex: `{cwdHash}-{sessionUuid}`

#### FileWatcher -- Adapt paths

Watch `~/.codex/sessions/` instead of `~/.claude/projects/`.
Monitor for new `rollout-*.jsonl` files and changes to existing ones.

**Chokidar glob pattern:**

```typescript
// claude-devtools
'~/.claude/projects/**/*.jsonl'

// codex-devtools
'~/.codex/sessions/**/*.jsonl'
```

Emit `file-change` for sidebar/detail refresh.

#### ConfigManager -- Adapt config location

Store config at `~/.config/codex-devtools/config.json` (XDG standard).

Simplified config (no notification triggers, no SSH, no ignore patterns in v1):

```typescript
interface CodexDevToolsConfig {
  general: {
    launchAtLogin: boolean;
    showDockIcon: boolean;
    codexSessionsPath?: string; // Override ~/.codex/sessions
  };
  display: {
    showReasoning: boolean;      // Show/hide thinking blocks
    showTokenCounts: boolean;    // Show/hide token metrics
    showDeveloperMessages: boolean; // Show/hide developer prompts
    theme: 'system' | 'dark' | 'light';
  };
  httpServer?: {
    enabled: boolean;
    port?: number;
  };
}
```

#### FileSystemProvider -- Keep local only (v1)

Keep `LocalFileSystemProvider`. Remove `SshFileSystemProvider` and SSH abstraction in v1.

#### ServiceContext -- Simplify

Single context only (local). No registry needed in v1.

```typescript
// claude-devtools: ServiceContextRegistry with local + SSH contexts
// codex-devtools v1: Single CodexServiceContext (local only)

class CodexServiceContext {
  readonly sessionScanner: CodexSessionScanner;
  readonly sessionParser: CodexSessionParser;
  readonly entryParser: CodexEntryParser;
  readonly messageClassifier: CodexMessageClassifier;
  readonly chunkBuilder: CodexChunkBuilder;
  readonly turnBuilder: CodexTurnBuilder;
  readonly toolExecutionBuilder: CodexToolExecutionBuilder;
  readonly semanticStepExtractor: CodexSemanticStepExtractor;
  readonly sessionSearcher: CodexSessionSearcher;
  readonly sessionFilter: CodexSessionFilter;
  readonly sessionContentFilter: CodexSessionContentFilter;
  readonly dataCache: DataCache;
  readonly fileWatcher: FileWatcher;
  readonly configManager: ConfigManager;

  start(): void;
  dispose(): void;
}
```

#### HttpServer -- Keep for standalone mode

Same Fastify-based HTTP server. Adapt routes to codex-devtools endpoints.

#### NotificationManager -> NOT NEEDED (v1)

No error detection, notification triggers, or system notifications in v1.

#### SshConnectionManager -> NOT NEEDED (v1)

No SSH support in v1.

#### UpdaterService -> KEEP

Same auto-update mechanism via electron-updater + GitHub releases.

---

### 1.5 Full Service Mapping Table

| Claude Service | Codex Service (v1) | Action | Notes |
|---|---|---|---|
| `ProjectScanner` | `CodexSessionScanner` | Replace | Scan `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`, parse `session_meta.payload.cwd`, group by CWD |
| `SubagentResolver` | Not needed | Remove | Codex logs do not use Claude-style subagent files |
| `SessionParser` | `CodexSessionParser` | Replace | Stream-parse JSONL lines into Codex entry union, normalize to renderer-facing message timeline |
| -- | `CodexEntryParser` | **New** | Parse individual JSONL lines into typed CodexLogEntry objects |
| `MessageClassifier` | `CodexMessageClassifier` | Replace | Classify normalized items into categories for chunking |
| `ChunkBuilder` | `CodexChunkBuilder` | Replace | Simpler chunk assembly; no subagent/process linking |
| `ToolExecutionBuilder` | `CodexToolExecutionBuilder` | Replace | Link `function_call` + `function_call_output` by `call_id` |
| -- | `CodexTurnBuilder` | **New** | Delineate turns from task_started/task_complete events |
| -- | `CodexSemanticStepExtractor` | **New** | Build semantic steps from turn entries |
| -- | `CodexSessionFilter` | **New** | Workspace-level filtering (hide/pin, date range, model) |
| -- | `CodexSessionContentFilter` | **New** | Noise filtering for display (token_count, turn_context) |
| `DataCache` | `DataCache` | Adapt | Cache parsed session detail by `cwdHash/sessionId`, same TTL/LRU strategy |
| `FileWatcher` | `FileWatcher` | Adapt | Watch `~/.codex/sessions` recursively for appended/created `rollout-*.jsonl` |
| `ConfigManager` | `ConfigManager` | Adapt | Config at `~/.config/codex-devtools/config.json` (XDG standard) |
| `ServiceContext` + `ServiceContextRegistry` | `CodexServiceContext` (single local context) | Simplify | Keep context wrapper but drop SSH multi-context switching |
| Error/notification domain | Not needed in v1 | Remove | No notification triggers in v1 |
| `HttpServer` + SSE | `HttpServer` + SSE | Keep | Keep IPC + HTTP parity and unified renderer adapter behavior |
| `UpdaterService` | `UpdaterService` | Keep | Auto-update via electron-updater + GitHub releases |

---

## 2. TYPE MAPPING

### 2.1 JSONL Entry Types (Codex Log Format)

```typescript
// === Top-Level Envelope ===

interface CodexLogEntry {
  timestamp: string;  // ISO 8601
  type: CodexEntryType;
  payload: CodexPayload;
}

type CodexEntryType =
  | 'session_meta'
  | 'response_item'
  | 'turn_context'
  | 'event_msg'
  | 'compacted';

type CodexPayload =
  | SessionMetaPayload
  | ResponseItemPayload
  | TurnContextPayload
  | EventMsgPayload
  | CompactedPayload;
```

#### 2.1.1 Session Meta

```typescript
interface SessionMetaPayload {
  id: string;                     // Session UUID
  timestamp: string;              // ISO 8601
  cwd: string;                    // Working directory
  originator: string;             // Observed: "codex_cli_rs", "codex_sdk_ts", "codex_exec"
  cli_version: string;            // e.g., "0.94.0"
  source: string | SourceObject;  // Observed: "cli", "exec", or {"subagent":"review"}
  model_provider: string;         // Observed: "openai"
  base_instructions: {
    text: string;                 // System prompt text
  };
  git: GitInfo | Record<string, never> | null; // Can be object, empty object, or null
  model?: string;                 // Optional -- not always present in raw logs;
                                  // derive from first turn_context.model when missing
}

interface SourceObject {
  subagent?: string;              // e.g., "review"
  [key: string]: unknown;
}

interface GitInfo {
  commit_hash?: string;
  branch?: string;
  repository_url?: string;
}

interface SessionMetaEntry {
  timestamp: string;
  type: 'session_meta';
  payload: SessionMetaPayload;
}
```

#### 2.1.2 Response Items

```typescript
type ResponseItemPayload =
  | MessagePayload
  | FunctionCallPayload
  | FunctionCallOutputPayload
  | ReasoningPayload
  | CustomToolCallPayload
  | CustomToolCallOutputPayload
  | WebSearchCallPayload;

interface ResponseItemEntry {
  timestamp: string;
  type: 'response_item';
  payload: ResponseItemPayload;
}

// --- Message subtypes ---

interface MessagePayload {
  type: 'message';
  role: 'user' | 'developer' | 'assistant';
  phase?: 'commentary' | 'final_answer';  // Observed on assistant messages
  content: MessageContentBlock[];
}

type MessageContentBlock =
  | InputTextBlock
  | OutputTextBlock
  | InputImageBlock;

interface InputTextBlock {
  type: 'input_text';
  text: string;
}

interface OutputTextBlock {
  type: 'output_text';
  text: string;
}

interface InputImageBlock {
  type: 'input_image';
  image_url: string;
}

// --- Function call subtypes ---

interface FunctionCallPayload {
  type: 'function_call';
  name: string;                   // e.g., "shell_command"
  arguments: string;              // JSON-serialized args (double-encoded)
  call_id: string;                // Links to function_call_output
}

interface FunctionCallOutputPayload {
  type: 'function_call_output';
  call_id: string;                // Matches function_call.call_id
  output: string;                 // Command output text
}

// --- Reasoning subtype ---

interface ReasoningPayload {
  type: 'reasoning';
  summary: ReasoningSummaryBlock[];
  content: ReasoningContentBlock[] | null; // Observed block type: reasoning_text
  encrypted_content: string | null;        // Fernet-encrypted base64
}

interface ReasoningSummaryBlock {
  type: 'summary_text';
  text: string;
}

interface ReasoningContentBlock {
  type: 'reasoning_text';
  text: string;
}

// --- Custom tool call subtypes ---

interface CustomToolCallPayload {
  type: 'custom_tool_call';
  status: string;                 // e.g., "completed"
  call_id: string;
  name: string;                   // e.g., "apply_patch"
  input: string;                  // Patch content or arguments
}

interface CustomToolCallOutputPayload {
  type: 'custom_tool_call_output';
  call_id: string;
  output: string;                 // JSON-serialized result
}

// --- Web search subtype ---

interface WebSearchCallPayload {
  type: 'web_search_call';
  status: string;
  action?: {
    type: string;                 // e.g., "open_page"
  };
}
```

#### 2.1.3 Turn Context

```typescript
interface TurnContextPayload {
  turn_id: string;                // Observed in logs; identifies the turn
  cwd: string;
  approval_policy: 'never' | 'on-request';
  sandbox_policy: SandboxPolicy;
  model: string;                  // e.g., "gpt-5.2-codex"
  personality: string;            // e.g., "friendly"
  collaboration_mode: CollaborationMode;
  effort: 'xhigh' | 'high' | 'medium'; // 'xhigh' observed in actual logs
  summary: string;                // Observed: "auto"
  user_instructions: string;
  truncation_policy?: {
    mode: string;                 // "tokens"
    limit: number;                // e.g., 10000
  };
}

interface SandboxPolicy {
  type: 'danger-full-access' | 'workspace-write' | 'read-only';
  network_access?: boolean;
  exclude_tmpdir_env_var?: boolean;
  exclude_slash_tmp?: boolean;
}

interface CollaborationMode {
  mode: 'plan' | 'code' | 'default';
  settings: {
    model: string;
    reasoning_effort: 'medium' | 'high';
    developer_instructions: string;
  };
}

interface TurnContextEntry {
  timestamp: string;
  type: 'turn_context';
  payload: TurnContextPayload;
}
```

#### 2.1.4 Event Messages

```typescript
type EventMsgPayload =
  | TokenCountPayload
  | AgentReasoningPayload
  | AgentMessagePayload
  | UserMessagePayload
  | TaskStartedPayload
  | TaskCompletePayload
  | ItemCompletedPayload
  | ContextCompactedPayload
  | EnteredReviewModePayload
  | ExitedReviewModePayload
  | TurnAbortedPayload
  | ThreadRolledBackPayload;

interface EventMsgEntry {
  timestamp: string;
  type: 'event_msg';
  payload: EventMsgPayload;
}

// --- Token Count ---

interface TokenCountPayload {
  type: 'token_count';
  info: TokenCountInfo | null;
  rate_limits: RateLimitsInfo | null; // Shape is version-dependent; may be null
}

interface TokenCountInfo {
  total_token_usage: TokenUsageSnapshot;
  last_token_usage: TokenUsageSnapshot;
  model_context_window: number;
}

interface TokenUsageSnapshot {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_output_tokens: number;
  total_tokens: number;
}

interface RateLimitsInfo {
  primary?: RateLimitWindow;
  secondary?: RateLimitWindow;
  credits?: {
    has_credits: boolean;
    unlimited: boolean;
    balance: number | null;
  };
  plan_type?: string | null;
  [key: string]: unknown;         // Flexible for version-dependent fields
}

interface RateLimitWindow {
  used_percent: number;
  window_minutes: number;
  resets_at: number;              // Unix timestamp
}

// --- Agent / User Messages ---

interface AgentReasoningPayload {
  type: 'agent_reasoning';
  text: string;
}

interface AgentMessagePayload {
  type: 'agent_message';
  message: string;
}

interface UserMessagePayload {
  type: 'user_message';
  message: string;
  images: string[];
  local_images: string[];
  text_elements: TextElement[];
}

interface TextElement {
  placeholder: string;
  byte_range: { start: number; end: number };
}

// --- Turn Lifecycle Events ---

interface TaskStartedPayload {
  type: 'task_started';
  turn_id: string;                // UUID
  model_context_window: number;
  collaboration_mode_kind: string;
}

interface TaskCompletePayload {
  type: 'task_complete';
  turn_id: string;
  last_agent_message: string;
}

interface ItemCompletedPayload {
  type: 'item_completed';
  thread_id: string;
  turn_id: string;
  item: {
    type: string;                 // e.g., "Plan"
    id: string;
    text: string;
  };
}

interface ContextCompactedPayload {
  type: 'context_compacted';
}

interface EnteredReviewModePayload {
  type: 'entered_review_mode';
  target: { type: string };
  user_facing_hint: string;
}

interface ExitedReviewModePayload {
  type: 'exited_review_mode';
  review_output: string | null;
}

interface TurnAbortedPayload {
  type: 'turn_aborted';
  reason: string;                 // e.g., "interrupted"
}

interface ThreadRolledBackPayload {
  type: 'thread_rolled_back';
  num_turns: number;
}
```

#### 2.1.5 Compacted

```typescript
interface CompactedPayload {
  message: string;                // Usually empty
  replacement_history: CompactedHistoryItem[];
}

interface CompactedHistoryItem {
  type: 'message' | 'compaction';
  role?: 'user' | 'developer' | 'assistant';
  content?: MessageContentBlock[];
  encrypted_content?: string;
}

interface CompactedEntry {
  timestamp: string;
  type: 'compacted';
  payload: CompactedPayload;
}
```

---

### 2.2 Parsed Message Types (Internal Representation)

```typescript
// === Unified Parsed Message ===

interface CodexParsedMessage {
  id: string;                     // Stable: "sessionId:lineNumber"
  timestamp: Date;
  entryType: CodexEntryType;      // Source entry type
  category: CodexMessageCategory;

  // For user/assistant/developer messages
  role?: 'user' | 'developer' | 'assistant' | 'system';
  text?: string;                  // Flattened human-readable text
  phase?: 'commentary' | 'final_answer';

  // For reasoning
  reasoningSummary?: string;
  hasEncryptedContent?: boolean;

  // For tool calls
  toolCall?: CodexToolCall;

  // For tool results
  toolResult?: CodexToolResult;

  // For turn events
  turnEvent?: CodexTurnEvent;

  // For compaction
  compaction?: CodexCompaction;

  // Linking
  callId?: string;                // For tool call/result matching
  turnId?: string;                // From turn_context or task_started

  // Source reference
  raw: CodexLogEntry;             // Original JSONL entry (for detail panels)
}

type CodexMessageCategory =
  | 'user'
  | 'developer'
  | 'assistant'
  | 'reasoning'
  | 'toolCall'
  | 'toolResult'
  | 'turnEvent'
  | 'compact'
  | 'noise';

// === Tool Types ===

interface CodexToolCall {
  callId: string;
  type: 'function_call' | 'custom_tool_call' | 'web_search_call';
  name: string;                   // "shell_command", "apply_patch"
  arguments: string;              // Raw argument string
  parsedArgs?: Record<string, unknown>; // Best-effort JSON parse
  status?: string;                // For custom_tool_call
}

interface CodexToolResult {
  callId: string;
  output: string;                 // Raw output
  parsedOutput?: {                // Parsed from JSON if applicable
    output?: string;
    metadata?: {
      exit_code?: number;
      duration_seconds?: number;
    };
  };
  isError: boolean;               // exit_code !== 0
}

// === Function Call / Output (standalone reference types) ===

interface CodexFunctionCall {
  callId: string;
  name: string;
  argumentsRaw: string;
  argumentsJson: Record<string, unknown> | null; // Best-effort JSON parse
  timestamp: Date;
  messageId: string;
  status?: string;
}

interface CodexFunctionOutput {
  callId: string;
  outputRaw: string;
  outputJson: Record<string, unknown> | null; // Best-effort JSON parse
  timestamp: Date;
  messageId: string;
}

// === Turn Events ===

interface CodexTurnEvent {
  type: 'task_started' | 'task_complete' | 'turn_aborted'
      | 'context_compacted' | 'entered_review_mode'
      | 'exited_review_mode' | 'thread_rolled_back'
      | 'item_completed';
  turnId?: string;
  reason?: string;                // For turn_aborted
  lastAgentMessage?: string;      // For task_complete
}

// === Compaction ===

interface CodexCompaction {
  replacementHistory: CompactedHistoryItem[];
}
```

---

### 2.3 Chunk Types

```typescript
// === Base Chunk ===

interface CodexBaseChunk {
  id: string;
  startTime: Date;
  endTime: Date;
  durationMs: number;
}

// === User Chunk ===

interface CodexUserChunk extends CodexBaseChunk {
  chunkType: 'user';
  message: string;                // User's message text
  images: string[];               // Attached images (URLs)
  localImages: string[];          // Local image paths
}

// === AI Chunk ===

interface CodexAIChunk extends CodexBaseChunk {
  chunkType: 'ai';
  turnId?: string;                // From task_started
  model: string;                  // From turn_context
  collaborationMode: string;      // 'plan' | 'code' | 'default'
  messages: CodexParsedMessage[]; // Assistant + reasoning + tool call/output
  reasoningSteps: CodexReasoningStep[];
  toolExecutions: CodexToolExecution[];
  outputMessages: string[];       // agent_message text segments
  lastAssistantOutput?: string;   // Final assistant text
  isAborted: boolean;             // true if turn_aborted
  abortReason?: string;
}

interface CodexReasoningStep {
  id: string;
  timestamp: Date;
  summaryText: string;            // From reasoning.summary
  hasEncryptedContent: boolean;
}

interface CodexToolExecution {
  id: string;                     // call_id
  type: 'function_call' | 'custom_tool_call' | 'web_search_call';
  name: string;
  input: string;
  parsedInput?: Record<string, unknown>;
  output: string;
  parsedOutput?: Record<string, unknown>;
  callTimestamp: Date;
  resultTimestamp: Date;
  durationMs: number;
  isError: boolean;               // Derived from exit_code in output JSON
  isMatched: boolean;             // Has both call and output
}

// === System Chunk ===

interface CodexSystemChunk extends CodexBaseChunk {
  chunkType: 'system';
  eventType: string;              // 'context_compacted', 'entered_review_mode', etc.
  systemMessages: CodexParsedMessage[];
  message?: string;
}

// === Compact Chunk ===

interface CodexCompactChunk extends CodexBaseChunk {
  chunkType: 'compact';
  compactionNumber: number;       // Sequential compaction count
}

// === Union types ===

type CodexChunk = CodexUserChunk | CodexAIChunk | CodexSystemChunk | CodexCompactChunk;

// === Enhanced Chunks (with semantic steps) ===

interface CodexEnhancedAIChunk extends CodexAIChunk {
  semanticSteps: CodexSemanticStep[];
  rawEntries: CodexLogEntry[];
}

interface CodexSemanticStep {
  id: string;
  type: CodexSemanticStepType;
  timestamp: Date;
  label: string;
  detail?: string;
}

type CodexEnhancedChunk =
  | CodexUserChunk
  | CodexEnhancedAIChunk
  | CodexSystemChunk
  | CodexCompactChunk;
```

---

### 2.4 Session Metrics

The `CodexSessionMetrics` type merges token-level sum/snapshot tracking with operational metrics.

**Token accounting approach:**
- `sum*` fields: accumulated from each `info.last_token_usage` (per-turn incremental usage).
- `latestSnapshot*` fields: taken from the most recent `info.total_token_usage` (running cumulative from the API).
- Both are maintained because `total_token_usage` is a server-side snapshot and `last_token_usage` is per-request; they may diverge due to compaction or retries.

```typescript
interface CodexSessionMetrics {
  // --- Token event tracking ---
  tokenEventsTotal: number;               // Total count of token_count events
  tokenEventsWithInfo: number;            // Count where info != null

  // --- Summed from last_token_usage (per-turn incremental) ---
  sumInputTokens: number;
  sumCachedInputTokens: number;
  sumOutputTokens: number;
  sumReasoningOutputTokens: number;
  sumTotalTokens: number;

  // --- Latest snapshot from total_token_usage (API cumulative) ---
  latestSnapshotInputTokens: number;
  latestSnapshotCachedInputTokens: number;
  latestSnapshotOutputTokens: number;
  latestSnapshotReasoningOutputTokens: number;
  latestSnapshotTotalTokens: number;

  // --- Context window ---
  latestModelContextWindow: number;
  latestRateLimits: RateLimitsInfo | null;

  // --- Timing ---
  durationMs: number;
  firstEventAt: Date;                     // Earliest event timestamp in session
  lastEventAt: Date;                      // Latest event timestamp in session

  // --- Operational metrics ---
  turnCount: number;
  abortedTurnCount: number;
  compactionCount: number;

  // --- Tool usage ---
  totalToolCalls: number;
  toolCallsByType: Record<string, number>; // e.g., { shell_command: 12, apply_patch: 5 }
  errorCount: number;                      // Tool calls with non-zero exit codes

  // --- Message counts ---
  userMessageCount: number;
  assistantMessageCount: number;
  reasoningStepCount: number;
  messageCount: number;                    // Total messages (all categories)

  // --- Model info ---
  model: string;
  contextWindowSize?: number;             // From task_started.model_context_window
}
```

---

### 2.5 Domain Types

```typescript
// === Project (synthesized from session CWDs) ===

interface CodexProject {
  id: string;                     // Hash of normalized CWD
  path: string;                   // CWD path
  name: string;                   // Last path segment
  sessionCount: number;
  mostRecentSession: number;      // Unix timestamp
  gitInfo?: {
    branch: string;
    repositoryUrl: string;
    commitHash: string;
  };
}

// === Session (lightweight, for list views) ===

interface CodexSession {
  id: string;                     // Prefer session_meta.payload.id; fallback UUID from filename
  projectId: string;              // Derived from CWD
  projectPath: string;            // CWD from session_meta
  filePath: string;               // Full path to .jsonl file
  createdAt: number;              // Unix timestamp from filename/meta
  firstMessage?: string;          // Preview from first user_message
  messageCount: number;           // Quick scan count
  model: string;                  // From session_meta.model or first turn_context.model
  cliVersion: string;             // From session_meta
  isOngoing?: boolean;            // No task_complete for last turn
  gitBranch?: string;
  collaborationMode?: string;     // From turn_context
}

// === Session Detail (full parsed session) ===

interface CodexSessionDetail {
  session: CodexSession;
  meta: SessionMetaPayload;
  chunks: CodexEnhancedChunk[];
  turns: CodexTurn[];
  metrics: CodexSessionMetrics;
  contextHistory: TurnContextPayload[];   // All turn_context snapshots
}

// === Turn (logical grouping) ===

interface CodexTurn {
  id: string;                     // turn_id from task_started
  turnNumber: number;             // 1-based sequential
  startTime: Date;
  endTime: Date;
  durationMs: number;
  model: string;
  collaborationMode: string;
  status: 'complete' | 'aborted';
  abortReason?: string;
  userMessage?: string;           // User message that triggered this turn
  lastAgentMessage?: string;      // From task_complete
  toolExecutions: CodexToolExecution[];
  reasoningSteps: CodexReasoningStep[];
}

// === Search ===

interface CodexSearchResult {
  sessionId: string;
  projectId: string;
  sessionTitle: string;           // First user message
  matchedText: string;
  context: string;                // Surrounding text
  messageType: 'user' | 'assistant' | 'tool';
  timestamp: number;
}

interface CodexSearchSessionsResult {
  results: CodexSearchResult[];
  totalMatches: number;
  sessionsSearched: number;
  query: string;
}

// === Pagination ===

interface CodexSessionCursor {
  timestamp: number;
  sessionId: string;
}

interface CodexPaginatedSessionsResult {
  sessions: CodexSession[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount: number;
}
```

---

## 3. RENDERER ADAPTATION

### 3.1 Store Slices

| claude-devtools Slice | codex-devtools | Action | Notes |
|-----------------------|----------------|--------|-------|
| **ProjectSlice** | **ProjectSlice** | **ADAPT** | Synthesize projects from CWD grouping via `CodexSessionScanner.scanWorkspaces` |
| **RepositorySlice** | -- | **REMOVE** | No worktree grouping in v1; simple workspace grouping only |
| **SessionSlice** | **SessionSlice** | **ADAPT** | Same pagination pattern, different data shape; Codex date-based index |
| **SessionDetailSlice** | **SessionDetailSlice** | **ADAPT** | Uses `CodexSessionDetail`/`CodexEnhancedChunk`; drop CLAUDE.md/context-injection/subagent fields |
| **SubagentSlice** | -- | **REMOVE** | No subagents |
| **ConversationSlice** | **ConversationSlice** | **ADAPT** | Same expansion/search logic, different group structure; remove subagent-specific expansion state |
| **TabSlice** | **TabSlice** | **KEEP** | Identical tab management |
| **TabUISlice** | **TabUISlice** | **ADAPT** | Remove subagent trace expansion |
| **PaneSlice** | **PaneSlice** | **KEEP** | Identical pane management |
| **UISlice** | **UISlice** | **KEEP** | Command palette, sidebar state |
| **NotificationSlice** | -- | **REMOVE** | No notifications in v1 |
| **ConfigSlice** | **ConfigSlice** | **ADAPT** | Simplified `CodexDevToolsConfig` schema and sections |
| **ConnectionSlice** | -- | **REMOVE** | No SSH in v1 |
| **ContextSlice** | -- | **REMOVE** | Single context only |
| **UpdateSlice** | **UpdateSlice** | **KEEP** | Auto-updater UI state |

**New slices:**

| Slice | Purpose |
|-------|---------|
| **MetricsSlice** | Token usage timeline, per-turn token snapshots, rate limit display from `event_msg.token_count` |
| **RawLogSlice** (optional, P2) | Debug/raw entry inspection toggle |

**Final slice count: 11** (down from 15; potentially 12 with RawLogSlice)

### 3.2 Components

#### Components to KEEP (minimal changes)

| Component | Notes |
|-----------|-------|
| `TabbedLayout` | Remove SSH indicator, notification bell |
| `PaneContainer` | Identical |
| `PaneView`, `PaneContent` | Identical |
| `TabBar`, `SessionTabContent` | Identical |
| `WindowsTitleBar` | Identical |
| `CommandPalette` | Adapt search to Codex search API |
| `SearchBar` | Identical |
| `ConfirmDialog` | Identical |
| `ErrorBoundary` | Identical |
| `UpdateBanner` | Identical |
| `UpdateDialog` | Identical |
| `CodeBlockViewer` | Identical |
| `MarkdownViewer` | Identical |
| Copy helpers | Identical |

#### Components to ADAPT

| Component | Changes |
|-----------|---------|
| **Sidebar** | Remove repository grouping toggle, SSH indicator. Keep date-grouped sessions, pinning, search. CWD workspace selector instead of repository/worktree logic. |
| **SidebarHeader** | CWD workspace selector (remove repository/worktree logic) |
| **DateGroupedSessions** | Use directory-based dates instead of file birthtime |
| **SessionItem** | Show model, collaboration mode, CLI version instead of context consumption |
| **ChatHistory** | Render `CodexChunk`/`CodexEnhancedChunk` instead of claude-devtools `EnhancedChunks`. No subagent drill-down. |
| **ChatHistoryItem** | Adapt for `CodexChunk` types |
| **UserChatGroup** | Render `CodexUserChunk` (simpler -- just message text + images) |
| **AIChatGroup** | Render `CodexAIChunk` -- reasoning steps, tool executions, output messages. No subagent traces. |
| **DisplayItemList** | Adapt for `CodexToolExecution` display |
| **DiffViewer** | Reuse for `apply_patch` diffs |
| **DashboardView** | Workspace cards from CWD groups, token/session stats |
| **SettingsView** | Simplified sections -- General + Display only |
| **GeneralSection** | Codex sessions path, launch at login |

#### Components to REMOVE

| Component | Reason |
|-----------|--------|
| `SubagentItem` | No subagents |
| `ExecutionTrace` / teammate components | No subagents |
| `SystemChatGroup` | Replace with simpler system event display |
| `ContextBadge` | No CLAUDE.md injection tracking |
| `SessionContextPanel` | No context injection analysis |
| `ConnectionSection` | No SSH |
| `ConnectionStatusBadge` | No SSH |
| `ContextSwitchOverlay` | No context switching |
| `WorkspaceIndicator` | No SSH workspaces |
| `NotificationsSection` | No notifications |
| `NotificationsPanel` | No notifications |
| `NotificationItem` | No notifications |
| `NotificationTriggerSettings/*` | No triggers |
| Worktree-specific badges/selectors | No worktree management |

#### Components to ADD

| Component | Purpose |
|-----------|---------|
| **SessionMetaPanel** | Panel showing CWD, cli_version, originator, model, model_provider, git info |
| **TurnHeader** | Shows turn boundary with model, collaboration mode, context window size |
| **TurnStatusBadge** | Shows complete/aborted status with abort reason |
| **ReasoningBlock** | Renders reasoning summary with expand/collapse for encrypted content indicator |
| **ShellCommandViewer** | Specialized viewer for `shell_command` calls -- shows command, workdir, exit code, output |
| **ApplyPatchViewer** | Specialized viewer for `apply_patch` calls -- renders diff with syntax highlighting |
| **WebSearchViewer** | Specialized viewer for `web_search_call` |
| **DefaultToolViewer** | Fallback viewer for unrecognized tool types |
| **ToolErrorDisplay** | Error display for failed tool calls |
| **CollaborationModeBadge** | Visual indicator for plan/code/default mode |
| **RateLimitIndicator** | Shows primary/secondary rate limit usage from token_count events |
| **ReviewModeIndicator** | Shows when agent entered/exited review mode |
| **TokenUsagePanel** | Latest snapshot + cumulative sums |
| **TurnContextPanel** (optional) | Approval/sandbox/model per turn |
| **ToolExecutionTimeline** | Call/output pair list via `call_id` |
| **DisplaySection** | Settings section for reasoning, tokens, developer message toggles |

### 3.3 API Adapter

Adapt the unified IPC/HTTP proxy pattern. Same method names where possible:
- Electron mode: preload IPC bridge
- Browser mode: HTTP + SSE client

```typescript
interface CodexDevToolsAPI {
  // App
  getAppVersion(): Promise<string>;

  // Projects (synthesized from sessions)
  getProjects(): Promise<CodexProject[]>;

  // Sessions
  getSessions(projectId: string): Promise<CodexSession[]>;
  getSessionsPaginated(
    projectId: string,
    cursor: string | null,
    limit: number
  ): Promise<CodexPaginatedSessionsResult>;
  getSessionDetail(
    projectId: string,
    sessionId: string
  ): Promise<CodexSessionDetail | null>;
  getSessionMetrics(
    projectId: string,
    sessionId: string
  ): Promise<CodexSessionMetrics | null>;

  // Search
  searchSessions(
    projectId: string,
    query: string,
    maxResults?: number
  ): Promise<CodexSearchSessionsResult>;

  // Config
  config: {
    get(): Promise<CodexDevToolsConfig>;
    update(section: string, data: unknown): Promise<void>;
    pinSession(projectId: string, sessionId: string): Promise<void>;
    unpinSession(projectId: string, sessionId: string): Promise<void>;
    hideSession(projectId: string, sessionId: string): Promise<void>;
    unhideSession(projectId: string, sessionId: string): Promise<void>;
  };

  // File events
  onFileChange(callback: (event: FileChangeEvent) => void): () => void;

  // Window controls
  windowControls: {
    minimize(): void;
    maximize(): void;
    close(): void;
    isMaximized(): Promise<boolean>;
  };

  // Updater
  updater: {
    check(): Promise<{ available: boolean; version?: string }>;
    download(): Promise<void>;
    install(): void;
    onStatus(callback: (status: UpdateStatus) => void): () => void;
  };

  // Shell actions
  openPath(path: string): Promise<void>;
  openExternal(url: string): Promise<void>;
}
```

**Removed from claude-devtools API:**
- `getRepositoryGroups()`, `getWorktreeSessions()`
- `getSubagentDetail()`, `getSessionGroups()`, `getWaterfallData()`
- `validatePath()`, `validateMentions()`
- `readClaudeMdFiles()`, `readDirectoryClaudeMd()`, `readMentionedFile()`
- `notifications.*` (entire namespace)
- `ssh.*` (entire namespace)
- `context.*` (entire namespace)
- `httpServer.*` (managed internally, not exposed to renderer)
- `session.scrollToLine()` (no line-level scroll)

### 3.4 Data Flow

```
Codex JSONL File Change
  |
FileWatcher detects change (chokidar on ~/.codex/sessions/**/*.jsonl)
  |
IPC/SSE -> Renderer
  |
Store: debounced refresh (150ms)
  |
CodexEntryParser parses JSONL lines
  |
CodexSessionParser builds session structure
  |
CodexMessageClassifier categorizes entries
  |
CodexTurnBuilder delineates turns
  |
CodexToolExecutionBuilder links call_id pairs
  |
CodexChunkBuilder builds chunks
  |
CodexSemanticStepExtractor attaches semantic steps
  |
Store updates conversation in-place
  |
Components re-render (no flicker)
```

### 3.5 Hooks

| Hook | Action | Notes |
|------|--------|-------|
| `useKeyboardShortcuts` | **KEEP** | Same shortcuts |
| `useZoomFactor` | **KEEP** | Same zoom behavior |
| `useTheme` | **KEEP** | Same theme system |
| `useVisibleAIGroup` | **ADAPT** | Rename to `useVisibleChunk`; adapt for `CodexChunk` types |
| `useAutoScrollBottom` | **KEEP** | Same scroll behavior |
| `useTabNavigationController` | **ADAPT** | Remove error navigation, keep search |
| `useTabUI` | **ADAPT** | Remove subagent expansion |

### 3.6 Priority-Ranked New Features

| Feature | Priority | Description |
|---------|----------|-------------|
| **Collaboration Mode Display** | P0 | Show plan/code/default mode per turn with visual indicator |
| **Rate Limit Dashboard** | P0 | Real-time rate limit usage from token_count events |
| **Reasoning Summary Display** | P0 | Render reasoning summaries with collapse/expand |
| **Turn-Based Navigation** | P0 | Navigate between turns (task_started -> task_complete) |
| **Shell Command Viewer** | P0 | Rich display of shell_command with command, workdir, exit code, output |
| **Apply Patch Viewer** | P0 | Syntax-highlighted diff view for apply_patch calls |
| **Turn Abort Display** | P0 | Show interrupted turns with reason |
| **Review Mode Indicator** | P1 | Show when agent enters/exits review mode |
| **Context Compaction Marker** | P1 | Visual marker when context is compacted |
| **Sandbox Policy Display** | P1 | Show current sandbox and approval policies |
| **Model Provider Badge** | P1 | Show model provider (e.g., "openai") alongside model name |
| **Encrypted Content Indicator** | P2 | Indicate when reasoning has encrypted (hidden) content |
| **Raw Log Inspector** | P2 | Optional raw JSONL entry inspection panel |

---

## 4. PROJECT STRUCTURE

```
codex-devtools/
+-- .editorconfig
+-- .prettierrc.json
+-- .gitignore
+-- package.json
+-- pnpm-lock.yaml
+-- tsconfig.json
+-- tsconfig.node.json
+-- tsconfig.test.json
+-- electron.vite.config.ts
+-- vite.standalone.config.ts
+-- vitest.config.ts
+-- eslint.config.js
+-- tailwind.config.js
+-- postcss.config.cjs
+-- knip.json
|
+-- resources/
|   +-- icons/
|   |   +-- mac/icon.icns
|   |   +-- win/icon.ico
|   |   +-- png/
|   +-- entitlements.mac.plist
|
+-- src/
|   +-- main/
|   |   +-- index.ts                          # Electron lifecycle
|   |   +-- standalone.ts                     # Standalone HTTP server
|   |   |
|   |   +-- services/
|   |   |   +-- discovery/
|   |   |   |   +-- CodexSessionScanner.ts    # Session file discovery + CWD grouping
|   |   |   |   +-- CodexSessionSearcher.ts   # Full-text search
|   |   |   |   +-- CodexSessionFilter.ts     # Workspace-level filtering
|   |   |   |   +-- CodexSessionContentFilter.ts # Noise filtering for display
|   |   |   |
|   |   |   +-- parsing/
|   |   |   |   +-- CodexEntryParser.ts       # Parse individual JSONL lines
|   |   |   |   +-- CodexSessionParser.ts     # JSONL -> parsed session
|   |   |   |   +-- CodexMessageClassifier.ts # Categorize entries
|   |   |   |
|   |   |   +-- analysis/
|   |   |   |   +-- CodexChunkBuilder.ts      # Messages -> chunks
|   |   |   |   +-- CodexToolExecutionBuilder.ts  # Link call_id pairs
|   |   |   |   +-- CodexSemanticStepExtractor.ts # Build semantic steps
|   |   |   |   +-- CodexTurnBuilder.ts       # Delineate turns
|   |   |   |
|   |   |   +-- infrastructure/
|   |   |   |   +-- CodexServiceContext.ts     # Service container
|   |   |   |   +-- DataCache.ts              # LRU session cache
|   |   |   |   +-- FileWatcher.ts            # Watch ~/.codex/sessions
|   |   |   |   +-- ConfigManager.ts          # App configuration
|   |   |   |   +-- HttpServer.ts             # Fastify server
|   |   |   |   +-- LocalFileSystemProvider.ts
|   |   |   |
|   |   |   +-- index.ts                      # Service barrel export
|   |   |
|   |   +-- ipc/
|   |   |   +-- handlers.ts                   # Handler registration
|   |   |   +-- guards.ts                     # Input validation
|   |   |   +-- projects.ts                   # Project listing
|   |   |   +-- sessions.ts                   # Session CRUD + pagination
|   |   |   +-- search.ts                     # Session search
|   |   |   +-- config.ts                     # Configuration
|   |   |   +-- utility.ts                    # Shell, version
|   |   |   +-- window.ts                     # Window controls
|   |   |   +-- updater.ts                    # Auto-update
|   |   |
|   |   +-- http/
|   |   |   +-- index.ts                      # Route registration
|   |   |   +-- projects.ts
|   |   |   +-- sessions.ts
|   |   |   +-- search.ts
|   |   |   +-- config.ts
|   |   |   +-- events.ts                     # SSE endpoint
|   |   |   +-- updater.ts
|   |   |
|   |   +-- types/
|   |   |   +-- codex-jsonl.ts                # Raw JSONL entry types (section 2.1)
|   |   |   +-- parsed.ts                     # CodexParsedMessage, CodexToolCall (section 2.2)
|   |   |   +-- chunks.ts                     # Chunk types (section 2.3)
|   |   |   +-- metrics.ts                    # SessionMetrics, RateLimits (section 2.4)
|   |   |   +-- domain.ts                     # Project, Session, SearchResult (section 2.5)
|   |   |   +-- index.ts                      # Barrel export
|   |   |
|   |   +-- utils/
|   |       +-- codex-jsonl.ts                # JSONL parsing utilities
|   |       +-- sessionPath.ts                # Path construction/extraction
|   |       +-- toolOutputParser.ts           # Parse tool output JSON
|   |       +-- pathValidation.ts             # Path sanitization
|   |
|   +-- preload/
|   |   +-- index.ts                          # IPC bridge
|   |   +-- constants/
|   |       +-- ipcChannels.ts                # IPC channel name constants
|   |
|   +-- renderer/
|   |   +-- index.html
|   |   +-- main.tsx
|   |   +-- App.tsx
|   |   +-- index.css
|   |   |
|   |   +-- api/
|   |   |   +-- index.ts                      # Unified API proxy
|   |   |   +-- httpClient.ts                 # HTTP fallback client
|   |   |
|   |   +-- store/
|   |   |   +-- index.ts                      # Zustand store root
|   |   |   +-- types.ts                      # Store type definitions
|   |   |   +-- slices/
|   |   |       +-- projectSlice.ts           # CWD-based projects
|   |   |       +-- sessionSlice.ts           # Paginated sessions
|   |   |       +-- sessionDetailSlice.ts     # CodexSessionDetail
|   |   |       +-- conversationSlice.ts      # Expansion/search
|   |   |       +-- tabSlice.ts               # Tab management
|   |   |       +-- tabUISlice.ts             # Tab UI state
|   |   |       +-- paneSlice.ts              # Pane layout
|   |   |       +-- uiSlice.ts                # Global UI state
|   |   |       +-- configSlice.ts            # Configuration
|   |   |       +-- updateSlice.ts            # Auto-updater state
|   |   |       +-- metricsSlice.ts           # Rate limits, token counts
|   |   |
|   |   +-- components/
|   |   |   +-- layout/
|   |   |   |   +-- TabbedLayout.tsx
|   |   |   |   +-- Sidebar.tsx
|   |   |   |   +-- PaneContainer.tsx
|   |   |   |   +-- PaneView.tsx
|   |   |   |   +-- PaneContent.tsx
|   |   |   |   +-- WindowsTitleBar.tsx
|   |   |   |
|   |   |   +-- chat/
|   |   |   |   +-- ChatHistory.tsx
|   |   |   |   +-- ChatHistoryItem.tsx
|   |   |   |   +-- UserChatGroup.tsx
|   |   |   |   +-- AIChatGroup.tsx
|   |   |   |   +-- TurnHeader.tsx            # NEW
|   |   |   |   +-- TurnStatusBadge.tsx       # NEW
|   |   |   |   +-- ReasoningBlock.tsx        # NEW
|   |   |   |   +-- ChatHistoryEmptyState.tsx
|   |   |   |   +-- ChatHistoryLoadingState.tsx
|   |   |   |   |
|   |   |   |   +-- viewers/
|   |   |   |   |   +-- MarkdownViewer.tsx
|   |   |   |   |   +-- CodeBlockViewer.tsx
|   |   |   |   |   +-- DiffViewer.tsx
|   |   |   |   |
|   |   |   |   +-- items/
|   |   |   |       +-- ShellCommandViewer.tsx    # NEW
|   |   |   |       +-- ApplyPatchViewer.tsx      # NEW
|   |   |   |       +-- WebSearchViewer.tsx       # NEW
|   |   |   |       +-- DefaultToolViewer.tsx
|   |   |   |       +-- ToolErrorDisplay.tsx
|   |   |   |
|   |   |   +-- sidebar/
|   |   |   |   +-- DateGroupedSessions.tsx
|   |   |   |   +-- SessionItem.tsx
|   |   |   |   +-- SessionContextMenu.tsx
|   |   |   |
|   |   |   +-- settings/
|   |   |   |   +-- SettingsView.tsx
|   |   |   |   +-- GeneralSection.tsx
|   |   |   |   +-- DisplaySection.tsx        # NEW: reasoning, tokens, developer msgs
|   |   |   |
|   |   |   +-- badges/
|   |   |   |   +-- CollaborationModeBadge.tsx  # NEW
|   |   |   |   +-- RateLimitIndicator.tsx      # NEW
|   |   |   |   +-- ReviewModeIndicator.tsx     # NEW
|   |   |   |
|   |   |   +-- panels/
|   |   |   |   +-- SessionMetaPanel.tsx        # NEW
|   |   |   |   +-- TokenUsagePanel.tsx         # NEW
|   |   |   |   +-- TurnContextPanel.tsx        # NEW (optional)
|   |   |   |   +-- ToolExecutionTimeline.tsx   # NEW
|   |   |   |
|   |   |   +-- dashboard/
|   |   |   |   +-- DashboardView.tsx
|   |   |   |
|   |   |   +-- search/
|   |   |   |   +-- CommandPalette.tsx
|   |   |   |   +-- SearchBar.tsx
|   |   |   |
|   |   |   +-- common/
|   |   |       +-- ConfirmDialog.tsx
|   |   |       +-- ErrorBoundary.tsx
|   |   |       +-- UpdateBanner.tsx
|   |   |       +-- UpdateDialog.tsx
|   |   |
|   |   +-- hooks/
|   |   |   +-- useKeyboardShortcuts.ts
|   |   |   +-- useZoomFactor.ts
|   |   |   +-- useTheme.ts
|   |   |   +-- useVisibleChunk.ts            # Adapted from useVisibleAIGroup
|   |   |   +-- useAutoScrollBottom.ts
|   |   |   +-- useTabNavigationController.ts
|   |   |   +-- useTabUI.ts
|   |   |
|   |   +-- types/
|   |   |   +-- data.ts                       # Re-exports from shared
|   |   |   +-- tabs.ts                       # Tab types
|   |   |   +-- panes.ts                      # Pane layout types
|   |   |   +-- groups.ts                     # Conversation structure
|   |   |   +-- api.ts                        # API interface types
|   |   |
|   |   +-- utils/
|   |       +-- groupTransformer.ts           # Chunks -> conversation items
|   |       +-- dateGrouping.ts
|   |       +-- toolRendering.ts
|   |       +-- toolOutputParser.ts           # Parse shell output, patches
|   |       +-- pathUtils.ts
|   |       +-- formatters.ts
|   |       +-- stringUtils.ts
|   |
|   +-- shared/
|       +-- types/
|       |   +-- index.ts                      # Shared types (Session, Project, etc.)
|       |   +-- api.ts                        # CodexDevToolsAPI interface
|       +-- constants/
|           +-- index.ts                      # App constants
|
+-- test/
|   +-- setup.ts
|   +-- services/
|   |   +-- CodexEntryParser.test.ts
|   |   +-- CodexSessionParser.test.ts
|   |   +-- CodexChunkBuilder.test.ts
|   |   +-- CodexToolExecutionBuilder.test.ts
|   |   +-- CodexTurnBuilder.test.ts
|   |   +-- CodexSessionScanner.test.ts
|   +-- fixtures/
|       +-- sample-session-simple.jsonl
|       +-- sample-session-tools.jsonl
|       +-- sample-session-compacted.jsonl
|
+-- build/
    +-- ... (build scripts if needed)
```

---

## 5. FEATURES NOT NEEDED IN V1

### 5.1 Removed Features (from claude-devtools)

| Feature | claude-devtools Location | Reason for Removal |
|---------|--------------------------|-------------------|
| **SSH Remote Sessions** | `SshConnectionManager`, `SshFileSystemProvider`, `ConnectionSlice`, SSH IPC handlers | Codex CLI is local-only |
| **Subagent Resolution** | `SubagentResolver`, `SubagentLocator`, `SubagentDetailBuilder`, `ProcessLinker`, `SubagentSlice` | Codex CLI has no subagent concept |
| **Worktree/Repository Grouping** | `WorktreeGrouper`, `RepositorySlice`, worktree IPC handlers | Over-engineered for v1; simple CWD grouping sufficient |
| **Notification System** | `NotificationManager`, `ErrorDetector`, `ErrorTriggerChecker`, `NotificationSlice`, notification IPC handlers, `NotificationTriggerSettings/*` | Defer to v2 |
| **Context Injection Tracking** | `SessionContextPanel`, `ContextBadge`, `claudeMdTracker`, `contextTracker`, `ClaudeMdReader` | No CLAUDE.md in Codex |
| **Context Switching** | `ServiceContextRegistry`, `ContextSlice`, context IPC handlers, `ContextSwitchOverlay`, IndexedDB snapshot system | Single local context only |
| **Team Tracking** | Team detection in `Process` type | No team concept in Codex |
| **Waterfall Chart** | `WaterfallBuilder`, waterfall IPC/HTTP routes | No parallel execution to visualize (defer to v2) |
| **Conversation Groups** | `ConversationGroupBuilder`, `ConversationGroup` type | Turns provide simpler grouping |
| **File History Snapshots** | `file-history-snapshot` entry type handling | Not in Codex format |
| **Queue Operations** | `queue-operation` entry type handling | Not in Codex format |
| **Path Validation** | `validatePath`, `validateMentions` IPC handlers | No file mention system |
| **CLAUDE.md Reading** | `readClaudeMdFiles`, `readDirectoryClaudeMd`, `readMentionedFile` | Not applicable to Codex |
| **Scroll to Line** | `session.scrollToLine` | Not applicable |

### 5.2 Explicitly Out of Scope

- SSH remote sessions and SSH connection lifecycle
- Subagent resolution and subagent drill-down UI
- Team/member tracking
- Context injection tracking (`CLAUDE.md`, mentioned-file attribution UI)
- Notification trigger system and notification history UI
- Full support for every historical/extended Codex event type in primary UI
- Cross-thread orchestration/review-mode visualization beyond raw metadata

---

## 6. BUILD SYSTEM ADAPTATION

### 6.1 Changes from claude-devtools

| Aspect | Change |
|--------|--------|
| **App ID** | `com.codex.devtools` (was `com.claudecode.context`) |
| **Product Name** | `codex-devtools` (was `claude-devtools`) |
| **Package name** | `codex-devtools` |
| **Dependencies to remove** | `ssh2`, `ssh-config`, `@dnd-kit/*` (defer drag-drop to v2) |
| **Dependencies to keep** | `electron`, `electron-vite`, `electron-updater`, `fastify`, `react`, `zustand`, `lucide-react`, `react-markdown`, `remark-gfm`, `date-fns`, `tailwindcss`, `@tanstack/react-virtual`, `chokidar` |
| **electron-vite config** | Same 3-target build (main, preload, renderer) |
| **Path aliases** | Same: `@main`, `@renderer`, `@preload`, `@shared` |
| **Native module stubs** | Remove ssh2/cpu-features stubs |
| **Standalone config** | Same pattern, different app name |

### 6.2 Environment Variables

```bash
# Standalone mode
HOST=0.0.0.0
PORT=3456
CODEX_SESSIONS_PATH=~/.codex/sessions    # Override default path
CORS_ORIGIN=*                             # For Docker
```

### 6.3 electron-builder Config

```json
{
  "appId": "com.codex.devtools",
  "productName": "codex-devtools",
  "directories": { "output": "release" },
  "files": ["out/renderer/**", "dist-electron/**", "package.json"],
  "asar": true,
  "asarUnpack": ["out/renderer/**"],
  "mac": {
    "category": "public.app-category.developer-tools",
    "target": ["dmg", "zip"],
    "icon": "resources/icons/mac/icon.icns"
  },
  "win": {
    "target": ["nsis"],
    "icon": "resources/icons/win/icon.ico"
  },
  "linux": {
    "target": ["AppImage", "deb"],
    "category": "Development"
  }
}
```

---

## 7. MIGRATION CHECKLIST

### Phase 1: Scaffold and Infrastructure

- [ ] Initialize project with electron-vite template
- [ ] Set up path aliases, TypeScript configs, ESLint, Prettier, Tailwind
- [ ] Port `LocalFileSystemProvider`, `DataCache`, `FileWatcher` (adapt paths to `~/.codex/sessions`)
- [ ] Port `ConfigManager` with simplified config schema (XDG path: `~/.config/codex-devtools/config.json`)
- [ ] Port `HttpServer` (Fastify)
- [ ] Create `CodexServiceContext` (single context, no registry)

### Phase 2: Codex JSONL Parsing

- [ ] Define all Codex JSONL types in `types/codex-jsonl.ts` (section 2.1 of this document)
- [ ] Implement `CodexEntryParser` -- parse individual JSONL lines with envelope validation
- [ ] Implement `CodexSessionParser` -- parse full session files with `session_meta` fallback logic
- [ ] Implement `CodexMessageClassifier` -- categorize entries into `CodexMessageCategory`
- [ ] Implement `CodexToolExecutionBuilder` -- link `call_id` pairs for function_call/custom_tool_call
- [ ] Write tests with fixture JSONL files (simple session, tool-heavy session, compacted session)

### Phase 3: Discovery and Analysis

- [ ] Implement `CodexSessionScanner` -- walk date directories, extract metadata, group by CWD
- [ ] Implement project synthesis (group sessions by CWD, derive `CodexProject` objects)
- [ ] Implement `CodexChunkBuilder` -- build chunks from parsed messages using turn boundaries
- [ ] Implement `CodexTurnBuilder` -- delineate turns from task_started/task_complete/turn_aborted
- [ ] Implement `CodexSemanticStepExtractor` -- build semantic steps from turn entries
- [ ] Implement `CodexSessionSearcher` -- full-text search across session files
- [ ] Implement `CodexSessionFilter` -- workspace-level filtering
- [ ] Implement `CodexSessionContentFilter` -- noise filtering for display
- [ ] Write tests

### Phase 4: IPC and HTTP Layer

- [ ] Port IPC handler infrastructure (`guards.ts`, handler registration)
- [ ] Implement project IPC handlers (`projects.ts`)
- [ ] Implement session IPC handlers (`sessions.ts` -- list, detail, paginated)
- [ ] Implement search IPC handlers (`search.ts`)
- [ ] Implement config IPC handlers (`config.ts`)
- [ ] Implement utility IPC handlers (`utility.ts` -- shell, version)
- [ ] Implement window IPC handlers (`window.ts`)
- [ ] Implement updater IPC handlers (`updater.ts`)
- [ ] Mirror IPC handlers as HTTP routes
- [ ] Implement SSE endpoint for file change events (`events.ts`)
- [ ] Port preload script with IPC channel constants

### Phase 5: Renderer -- Store and API

- [ ] Port API adapter (IPC/HTTP proxy pattern) implementing `CodexDevToolsAPI` interface
- [ ] Port store infrastructure (Zustand) with 11 slices
- [ ] Implement `projectSlice` (CWD-based projects)
- [ ] Port `sessionSlice` (paginated sessions with `CodexSessionCursor`)
- [ ] Implement `sessionDetailSlice` (`CodexSessionDetail`)
- [ ] Port `conversationSlice` (expansion/search, no subagent state)
- [ ] Port `tabSlice`, `tabUISlice` (remove subagent trace expansion), `paneSlice`
- [ ] Port `uiSlice`, `configSlice`
- [ ] Port `updateSlice` (auto-updater UI state)
- [ ] Implement `metricsSlice` (rate limits, token counts from `event_msg.token_count`)

### Phase 6: Renderer -- Components

- [ ] Port layout components (`TabbedLayout`, `Sidebar`, `PaneContainer`, `PaneView`, `PaneContent`, `WindowsTitleBar`)
- [ ] Port common components (`ConfirmDialog`, `ErrorBoundary`, `UpdateBanner`, `UpdateDialog`)
- [ ] Implement chat components (`ChatHistory`, `ChatHistoryItem`, `UserChatGroup`, `AIChatGroup`)
- [ ] Implement new turn components (`TurnHeader`, `TurnStatusBadge`, `ReasoningBlock`)
- [ ] Implement tool viewers (`ShellCommandViewer`, `ApplyPatchViewer`, `WebSearchViewer`, `DefaultToolViewer`, `ToolErrorDisplay`)
- [ ] Implement badge components (`CollaborationModeBadge`, `RateLimitIndicator`, `ReviewModeIndicator`)
- [ ] Implement panel components (`SessionMetaPanel`, `TokenUsagePanel`, `ToolExecutionTimeline`)
- [ ] Port sidebar components (`DateGroupedSessions`, `SessionItem`, `SessionContextMenu`)
- [ ] Implement settings (`SettingsView`, `GeneralSection`, `DisplaySection`)
- [ ] Port `CommandPalette` and `SearchBar` (adapt search to Codex API)
- [ ] Port viewers (`MarkdownViewer`, `CodeBlockViewer`, `DiffViewer`)
- [ ] Port and adapt hooks (`useKeyboardShortcuts`, `useZoomFactor`, `useTheme`, `useVisibleChunk`, `useAutoScrollBottom`, `useTabNavigationController`, `useTabUI`)
- [ ] Implement `DashboardView` (workspace cards, token/session stats)

### Phase 7: Polish and Testing

- [ ] Theme system (dark/light/system with CSS variables)
- [ ] Keyboard shortcuts
- [ ] Splash screen
- [ ] End-to-end testing with real Codex sessions
- [ ] Performance testing (large sessions, many files)
- [ ] Package with electron-builder (mac/win/linux)
- [ ] Verify parity in both Electron IPC and standalone HTTP modes

---

*End of unified adaptation plan.*
