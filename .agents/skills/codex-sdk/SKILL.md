---
name: codex-sdk
description: Build and debug TypeScript integrations with OpenAI Codex SDK (`@openai/codex-sdk`). Use when implementing programmatic Codex workflows with `Codex`, `startThread()`, `resumeThread()`, `run()`, `runStreamed()`, structured output schemas, image inputs, thread persistence, CLI config overrides, environment control, or `ThreadEvent` and `ThreadItem` handling.
---

# Codex SDK (TypeScript)

## Quick Reference

| Concept | Details |
|---------|---------|
| Package | `@openai/codex-sdk` |
| Runtime | Node.js 18+ |
| Primary class | `Codex` |
| Conversation unit | `Thread` |
| One-shot turn | `thread.run(input, turnOptions?)` |
| Streaming turn | `thread.runStreamed(input, turnOptions?)` |
| Input type | `string` or structured `UserInput[]` (text + local images) |
| Turn result | `{ items, finalResponse, usage }` |
| Streaming result | `{ events: AsyncGenerator<ThreadEvent> }` |

The SDK wraps the `codex` CLI and exchanges JSONL events via stdin/stdout. It is a process wrapper, not a direct HTTP API client.

## Start a Turn

```typescript
import { Codex } from "@openai/codex-sdk";

const codex = new Codex();
const thread = codex.startThread();

const turn = await thread.run("Diagnose failing tests and propose a fix");
console.log(turn.finalResponse);
console.log(turn.items);
```

## Continue or Resume Conversation

- Continue in-memory context by calling `run()` repeatedly on the same `Thread`.
- Resume persisted context with `codex.resumeThread(threadId)` (sessions are persisted in `~/.codex/sessions`).
- Persist `thread.id` after `thread.started` is emitted (or after first `run()` completes).

## Choose Execution Mode

Use `run()` when only final output is needed:
- Aggregate completed items.
- Throw if the turn fails.

Use `runStreamed()` when intermediate progress is needed:
- Inspect tool execution updates in real time.
- Process `item.started`, `item.updated`, `item.completed`, `turn.completed`, and `turn.failed`.

## Configure Thread Behavior

Set thread-level behavior in `startThread()` / `resumeThread()`:
- `model`, `sandboxMode`, `approvalPolicy`
- `workingDirectory`, `skipGitRepoCheck`, `additionalDirectories`
- `modelReasoningEffort`, `networkAccessEnabled`
- `webSearchMode` (preferred) or legacy `webSearchEnabled`

### Reasoning Effort

```typescript
type ModelReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";

const thread = codex.startThread({
  model: "gpt-5.2-codex",
  modelReasoningEffort: "xhigh",  // max reasoning for complex tasks
});
```

Maps to CLI: `--config model_reasoning_effort="xhigh"`. Use `"high"` or `"xhigh"` for hard problems (architecture, debugging). Default is model-dependent.

Default model: `gpt-5.2` (auto-migrated to `gpt-5.2-codex`) from `~/.codex/config.toml`. Override with `model` in `startThread()`.

**OpenRouter:** Use `baseUrl: "https://openrouter.ai/api/v1"` with `apiKey: $OPENROUTER_API_KEY` and `model: "openrouter/free"` (or any OpenRouter model ID like `"openai/gpt-5"`).

Key precedence rule:
- Thread options override conflicting global CLI `config` overrides from `new Codex({ config })` because they are emitted later on the command line.

## Use Structured Output and Images

- Use `turnOptions.outputSchema` for strict JSON-schema outputs.
- Pass input as `UserInput[]` to include local images with prompt text.
- Keep `outputSchema` a plain JSON object.

## Handle Common Gotchas

- Ensure the runtime can locate Codex CLI binaries from `@openai/codex` optional platform packages; otherwise path resolution fails at startup.
- Set `skipGitRepoCheck: true` only when deliberately running outside a trusted Git repo.
- Treat `CodexOptions.env` as a full environment replacement, not a merge with `process.env`.
- Expect `run()` to throw on `turn.failed`.
- Prefer `webSearchMode` over `webSearchEnabled`; if both are supplied, `webSearchMode` takes precedence.

## Quick Local Smoke Test

When validating multi-instance env isolation and permission behavior quickly, use the project script:

```bash
pnpm run test:codex:parallel
```

This script (`test-codex-parallel-env.mjs`) checks:
- Two parallel Codex instances can run with different env vars without leaking values.
- A permission-mode scenario (`approvalPolicy: "on-request"`) and reports whether execution is blocked/prompted or auto-approved in the current environment.

## Observability

The SDK is a thin wrapper with limited observability compared to Claude SDK:

- **Thread IDs**: `thread.id` (read-only, set after first turn) or `thread.started` event. Persist and resume with `codex.resumeThread(id)`.
- **Compact**: No SDK access. Auto-compact happens silently in the Rust engine. App Server exposes `thread/compact/start` but SDK wraps `codex exec`, not the App Server.
- **Per-Turn Output**: `run()` returns `{ items, finalResponse, usage }` for current turn only. No `getHistory()` — accumulate items manually or read raw JSONL from `~/.codex/sessions/`.
- **Token Usage**: `turn.completed` event carries `{ input_tokens, cached_input_tokens, output_tokens }`.
- **MCP Visibility**: No `mcpServers` option in SDK — configure externally via `~/.codex/config.toml`. Agents always have 3 built-in discovery tools (`list_mcp_resources`, `list_mcp_resource_templates`, `read_mcp_resource`). MCP calls surface as `McpToolCallItem` in event stream with `server`/`tool` fields. No `allowedTools` filtering.

For full control (compact, history, fork, rollback), use the App Server JSON-RPC protocol directly.

See `references/observability.md` for full details and comparison.

## Read References on Demand

- `references/api-reference.md`: full classes, options, input/output, and CLI flag mapping.
- `references/event-types.md`: full `ThreadEvent` union and event loop handling.
- `references/item-types.md`: full `ThreadItem` union and item payloads/statuses.
- `references/examples.md`: copy-paste integration patterns for common workflows.
- `references/observability.md`: thread IDs, compact limitations, history access, App Server capabilities.
