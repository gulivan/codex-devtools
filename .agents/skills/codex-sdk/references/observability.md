# Observability — Thread IDs, Compact, History

## Thread IDs

The `Thread` class has a read-only `id` getter, populated after the first turn starts:

```typescript
const codex = new Codex();
const thread = codex.startThread();

// id is null before first turn
console.log(thread.id); // null

const { events } = await thread.runStreamed("Hello");
for await (const event of events) {
  if (event.type === "thread.started") {
    console.log("Thread ID:", event.thread_id);  // same as thread.id
  }
}

// id is set after thread.started event
console.log(thread.id); // "019c22a7-..."
```

### Persist and Resume

```typescript
// Save thread ID after first turn
const savedId = thread.id!;

// Resume later (loads full conversation context from ~/.codex/sessions/)
const resumed = codex.resumeThread(savedId);
const result = await resumed.run("Continue from where we left off");
console.log(result.finalResponse);
```

Sessions are persisted as JSONL files at `~/.codex/sessions/`.

## Compact

**The SDK does not expose any compact method.** The word "compact" does not appear in the SDK source.

| Compact type | SDK access | Notes |
|---|---|---|
| Manual compact | No | App Server exposes `thread/compact/start` but SDK wraps `codex exec`, not the App Server |
| Auto-compact | No (silent) | Happens internally in the Rust engine at token limits; not observable from SDK events |

For programmatic compact control, you'd need the App Server JSON-RPC protocol directly:

```json
{ "method": "thread/compact/start", "id": 42, "params": { "threadId": "thr_123" } }
```

This is not available through `@openai/codex-sdk`.

## Per-Turn Output

The SDK only provides output for the current turn — no method to retrieve full accumulated history.

### `run()` — Aggregated Result

```typescript
const result = await thread.run("Analyze the code");

// result.items: ThreadItem[]      — completed items from THIS turn only
// result.finalResponse: string    — last agent_message text from THIS turn
// result.usage: Usage | null      — token usage for THIS turn
```

### `runStreamed()` — Real-Time Events

```typescript
const { events } = await thread.runStreamed("Analyze the code");

for await (const event of events) {
  switch (event.type) {
    case "thread.started":
      console.log("Thread:", event.thread_id);
      break;
    case "item.started":
      console.log("Started:", event.item.type);
      break;
    case "item.updated":
      // Intermediate progress (e.g., streaming text)
      if (event.item.type === "agent_message") {
        process.stdout.write(event.item.text);
      }
      break;
    case "item.completed":
      console.log("Completed:", event.item.type);
      break;
    case "turn.completed":
      console.log("Usage:", event.usage);
      // { input_tokens, cached_input_tokens, output_tokens }
      break;
    case "turn.failed":
      console.error("Failed:", event.error.message);
      break;
  }
}
```

### Accumulate History Yourself

The SDK has no `getHistory()` — accumulate items across turns manually:

```typescript
const allItems: ThreadItem[] = [];
const allUsage: Usage[] = [];

async function runTurn(prompt: string) {
  const result = await thread.run(prompt);
  allItems.push(...result.items);
  if (result.usage) allUsage.push(result.usage);
  return result;
}

await runTurn("Read the auth module");
await runTurn("Now refactor it");

console.log(`Total items across ${allUsage.length} turns:`, allItems.length);
```

### Session Files on Disk

Sessions are persisted as JSONL files organized by date:

```
~/.codex/sessions/{YYYY}/{MM}/{DD}/rollout-{timestamp}-{thread-id}.jsonl
```

Filename format: `rollout-{YYYY}-{MM}-{DD}T{HH}-{mm}-{ss}-{uuid}.jsonl`

The UUID in the filename is the thread ID — same value as `thread.id` / `thread.started.thread_id`. Multiple concurrent threads get separate files with different UUIDs even when started at the same second:

```
~/.codex/sessions/2026/02/18/
├── rollout-2026-02-18T00-38-33-019c6d8a-6aa2-71b3-acdf-5c72c0acc53e.jsonl   # thread A
├── rollout-2026-02-18T00-38-33-019c6d8a-6aa2-7bd3-b492-c489da053f6d.jsonl   # thread B (same second, different UUID)
├── rollout-2026-02-18T00-57-01-019c6d9b-507f-7970-98a3-c3f190761a1a.jsonl
└── ...
```

To find a specific session by thread ID:

```typescript
import { readdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

async function findSessionFile(threadId: string, date: Date = new Date()): Promise<string | null> {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const dir = join(homedir(), ".codex", "sessions", String(yyyy), mm, dd);

  const files = await readdir(dir);
  const match = files.find(f => f.includes(threadId));
  return match ? join(dir, match) : null;
}
```

### JSONL Format

Each line is a JSON object with `timestamp`, `type`, and `payload`. Key event types in order:

**`session_meta`** — first line, session metadata:

```json
{
  "timestamp": "2026-02-17T21:46:35.152Z",
  "type": "session_meta",
  "payload": {
    "id": "019c6d91-c2ff-75d2-9354-6174c8029c5b",
    "cwd": "/Users/ivan/git/0spec1",
    "originator": "codex_sdk_ts",
    "cli_version": "0.101.0",
    "source": "exec",
    "model_provider": "openai",
    "base_instructions": { "text": "..." }
  }
}
```

**`response_item`** — system/user/assistant messages:

```json
{"type": "response_item", "payload": {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "..."}]}}
{"type": "response_item", "payload": {"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "..."}], "phase": "final_answer"}}
{"type": "response_item", "payload": {"type": "reasoning", "summary": [{"type": "summary_text", "text": "..."}], "encrypted_content": "..."}}
```

**`event_msg`** — lifecycle events:

```json
{"type": "event_msg", "payload": {"type": "task_started", "turn_id": "...", "model_context_window": 258400}}
{"type": "event_msg", "payload": {"type": "user_message", "message": "...", "images": []}}
{"type": "event_msg", "payload": {"type": "agent_reasoning", "text": "..."}}
{"type": "event_msg", "payload": {"type": "agent_message", "message": "HELLO_FROM_CODEX"}}
{"type": "event_msg", "payload": {"type": "task_complete", "turn_id": "...", "last_agent_message": "..."}}
```

**`turn_context`** — per-turn config snapshot:

```json
{
  "type": "turn_context",
  "payload": {
    "turn_id": "...",
    "cwd": "/Users/ivan/git/0spec1",
    "approval_policy": "never",
    "sandbox_policy": {"type": "danger-full-access"},
    "model": "gpt-5.3-codex",
    "effort": "xhigh",
    "summary": "auto"
  }
}
```

**Token usage** — reported via `event_msg` with `type: "token_count"`:

```json
{
  "type": "event_msg",
  "payload": {
    "type": "token_count",
    "info": {
      "total_token_usage": {
        "input_tokens": 8091,
        "cached_input_tokens": 7552,
        "output_tokens": 92,
        "reasoning_output_tokens": 81,
        "total_tokens": 8183
      },
      "model_context_window": 258400
    }
  }
}
```

### Reading Session Files

```typescript
import { createReadStream } from "fs";
import { createInterface } from "readline";

async function readSession(filePath: string) {
  const rl = createInterface({ input: createReadStream(filePath) });
  const events = [];
  for await (const line of rl) {
    if (line.trim()) events.push(JSON.parse(line));
  }
  return events;
}

## Skill Visibility

Codex auto-discovers skills from 3 locations and injects them into the system prompt via `AGENTS.md` instructions. **No extra config needed** — just set `workingDirectory` to a project with `.agents/skills/`:

| Location | Example path | Discovery |
|---|---|---|
| Project skills | `{cwd}/.agents/skills/{name}/SKILL.md` | Auto — from `workingDirectory` |
| User skills | `~/.agents/skills/{name}/SKILL.md` | Auto |
| System skills | `~/.codex/skills/.system/{name}/SKILL.md` | Auto |

Each skill appears in the system prompt with its **name**, **description**, and **full file path** — Codex agents can open the SKILL.md directly.

```typescript
// Skills auto-discovered from workingDirectory
const thread = codex.startThread({
  workingDirectory: "/Users/ivan/git/0spec1",  // has .agents/skills/
  // No extra skill config needed
});
```

**Contrast with Claude SDK**: Claude skills are name-only references (no file paths) loaded from `~/.claude/skills/` only when `settingSources: ["user", "project"]` is set. `.agents/skills/` (Codex-style) are not auto-discovered by Claude.

## MCP Visibility

### No `mcpServers` Option in SDK

The Codex SDK has **no** `mcpServers` option in `CodexOptions` or `ThreadOptions`. MCP servers are configured externally:
- `~/.codex/config.toml` — global MCP server config
- Project-level `AGENTS.md` or MCP config files

### Built-in MCP Discovery Tools

Codex agents always have 3 built-in MCP resource tools (regardless of whether any MCP servers are configured):

| Tool | Purpose |
|---|---|
| `list_mcp_resources` | Query configured MCP servers for available resources |
| `list_mcp_resource_templates` | Query MCP servers for resource templates |
| `read_mcp_resource` | Read a specific MCP resource by URI and server name |

**Naming differs from Claude SDK**: Codex uses `list_mcp_*` / `read_mcp_*` tool names, not the `mcp__<server>__<tool>` convention used by Claude SDK. When a Codex agent actually calls an MCP server's tool, it surfaces as an `mcp_tool_call` item with `server` and `tool` fields.

### Verified Test Results (2026-02-18)

With no MCP servers in `~/.codex/config.toml`:

```
[list_mcp_resources] → {"resources":[]}  // no servers configured
```

Agent still sees the 3 discovery tools but has no MCP servers to query.

### MCP Tool Call Observability

When MCP servers are configured and the agent calls them, `McpToolCallItem` appears in the event stream:

```typescript
type McpToolCallItem = {
  type: "mcp_tool_call";
  server: string;       // MCP server name
  tool: string;         // Tool name
  arguments: unknown;
  result?: { content: McpContentBlock[]; structured_content: unknown };
  error?: { message: string };
  status: "in_progress" | "completed" | "failed";
};
```

Visible on `item.started`, `item.updated`, `item.completed` events in `runStreamed()`.

### Contrast with Claude SDK

| Feature | Claude SDK | Codex SDK |
|---|---|---|
| Configure MCP in code | `options.mcpServers` per `query()` | Not supported — external config only |
| In-process MCP server | `createSdkMcpServer()` + `tool()` | Not supported |
| Transport types | stdio, http, sse, sdk | Depends on CLI/toml config |
| MCP tool naming | `mcp__<server>__<tool>` in `tools[]` | `server` + `tool` fields on `McpToolCallItem` |
| Inherit from settings | `settingSources: ["user", "project"]` | Auto from `~/.codex/config.toml` |
| Filter MCP tools | `allowedTools` / `disallowedTools` | Not supported (`approvalPolicy` only) |
| MCP status on init | `init.mcp_servers[]` + `q.mcpServerStatus()` | `list_mcp_resources` tool call |
| Discovery tools | None (tools appear directly) | `list_mcp_resources`, `list_mcp_resource_templates`, `read_mcp_resource` |

## App Server Capabilities (Not in SDK)

The Codex App Server JSON-RPC protocol exposes richer observability, but the SDK (`@openai/codex-sdk`) wraps `codex exec` and does not surface these:

| Capability | App Server method | SDK support |
|---|---|---|
| Trigger compact | `thread/compact/start` | No |
| Read full history | `thread/read` (with `includeTurns`) | No |
| List all threads | `thread/list` | No |
| Fork a thread | `thread/fork` | No |
| Rollback turns | `thread/rollback` | No |

## Summary

| Capability | Available | How |
|---|---|---|
| Get thread ID | Yes | `thread.id` after first turn, or `thread.started` event |
| Resume thread | Yes | `codex.resumeThread(id)` |
| Set custom ID | No | — |
| Fork thread | No | App Server only |
| Trigger compact | No | App Server only (`thread/compact/start`) |
| Observe compact | No | Silent internal auto-compact |
| Get current-turn items | Yes | `run()` returns `{ items, finalResponse, usage }` |
| Get current-turn events | Yes | `runStreamed()` yields `ThreadEvent` stream |
| Get full history | No (SDK) / Yes (disk) | Accumulate manually, or parse JSONL from `~/.codex/sessions/{YYYY}/{MM}/{DD}/rollout-...-{thread-id}.jsonl` |
| Token usage (SDK) | Yes | `turn.completed` event or `run().usage` |
| Token usage (JSONL) | Yes | `event_msg` with `payload.type: "token_count"` — includes `total_token_usage`, `model_context_window` |
| Session metadata (JSONL) | Yes | `session_meta` line — `id`, `cwd`, `cli_version`, `model_provider`, `base_instructions` |
| Turn config (JSONL) | Yes | `turn_context` line — `model`, `approval_policy`, `sandbox_policy`, `effort` |
| MCP config in code | No | Configure via `~/.codex/config.toml` or project MCP config |
| MCP discovery tools | Yes (built-in) | `list_mcp_resources`, `list_mcp_resource_templates`, `read_mcp_resource` |
| MCP call observability | Yes | `McpToolCallItem` in `runStreamed()` events |
| MCP tool filtering | No | No `allowedTools` equivalent |
