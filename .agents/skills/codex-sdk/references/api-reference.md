# API Reference

## Package Surface

```typescript
import {
  Codex,
  Thread,
  type CodexOptions,
  type ThreadOptions,
  type TurnOptions,
  type Input,
  type UserInput,
  type RunResult,
  type RunStreamedResult,
} from "@openai/codex-sdk";
```

## `Codex`

```typescript
class Codex {
  constructor(options?: CodexOptions);
  startThread(options?: ThreadOptions): Thread;
  resumeThread(id: string, options?: ThreadOptions): Thread;
}
```

## `CodexOptions`

```typescript
type CodexOptions = {
  codexPathOverride?: string;
  baseUrl?: string;
  apiKey?: string;
  config?: CodexConfigObject;
  env?: Record<string, string>;
};
```

Notes:
- `codexPathOverride`: explicitly choose a codex executable.
- `baseUrl`: forwarded as `OPENAI_BASE_URL`.
- `apiKey`: forwarded as `CODEX_API_KEY`.
- `env`: replaces inherited process env for spawned codex process.
- `config`: converted into repeated `--config key=value` CLI arguments.

## `Thread`

```typescript
class Thread {
  get id(): string | null;
  run(input: Input, turnOptions?: TurnOptions): Promise<RunResult>;
  runStreamed(input: Input, turnOptions?: TurnOptions): Promise<RunStreamedResult>;
}
```

`run()` return type:

```typescript
type RunResult = {
  items: ThreadItem[];
  finalResponse: string;
  usage: Usage | null;
};
```

`runStreamed()` return type:

```typescript
type RunStreamedResult = {
  events: AsyncGenerator<ThreadEvent>;
};
```

## Input Types

```typescript
type UserInput =
  | { type: "text"; text: string }
  | { type: "local_image"; path: string };

type Input = string | UserInput[];
```

Behavior:
- String input becomes the prompt.
- Structured input concatenates all text blocks with blank lines.
- Structured input forwards all `local_image` paths as repeated `--image` flags.

## `ThreadOptions`

```typescript
type ApprovalMode = "never" | "on-request" | "on-failure" | "untrusted";
type SandboxMode = "read-only" | "workspace-write" | "danger-full-access";
type ModelReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";
type WebSearchMode = "disabled" | "cached" | "live";

type ThreadOptions = {
  model?: string;
  sandboxMode?: SandboxMode;
  workingDirectory?: string;
  skipGitRepoCheck?: boolean;
  modelReasoningEffort?: ModelReasoningEffort;
  networkAccessEnabled?: boolean;
  webSearchMode?: WebSearchMode;
  webSearchEnabled?: boolean;
  approvalPolicy?: ApprovalMode;
  additionalDirectories?: string[];
};
```

## `TurnOptions`

```typescript
type TurnOptions = {
  outputSchema?: unknown;
  signal?: AbortSignal;
};
```

Rules:
- `outputSchema` must be a plain JSON object.
- `signal` cancels in-flight execution and iteration.

## CLI Mapping

Thread and turn options are converted to codex CLI args:

| SDK option | CLI representation |
|-----------|---------------------|
| `model` | `--model <value>` |
| `sandboxMode` | `--sandbox <value>` |
| `workingDirectory` | `--cd <dir>` |
| `additionalDirectories` | repeated `--add-dir <dir>` |
| `skipGitRepoCheck` | `--skip-git-repo-check` |
| `outputSchema` | `--output-schema <tmp-file>` |
| `modelReasoningEffort` | `--config model_reasoning_effort="<value>"` |
| `networkAccessEnabled` | `--config sandbox_workspace_write.network_access=<bool>` |
| `webSearchMode` | `--config web_search="<value>"` |
| `webSearchEnabled` | `--config web_search="live"` or `"disabled"` |
| `approvalPolicy` | `--config approval_policy="<value>"` |
| resumed thread ID | `resume <thread-id>` |
| image paths | repeated `--image <path>` |

Precedence:
- `webSearchMode` takes precedence over legacy `webSearchEnabled`.
- Global `CodexOptions.config` flags are emitted first.
- Thread-level options emit after globals and therefore override conflicts.

## Config Override Serialization

`CodexOptions.config` accepts nested JSON-like objects and arrays:
- Flatten nested objects using dotted keys (`a.b.c=value`).
- Serialize strings, numbers, booleans, arrays, and objects as TOML literals.
- Skip keys whose value is `undefined`.
- Reject `null`, non-finite numbers, or non-object top-level values.

## Binary Resolution

If `codexPathOverride` is not supplied, the SDK resolves codex binaries from the `@openai/codex` package and its platform-specific optional dependencies.

If resolution fails, runtime throws an error indicating binaries could not be located.
