# Examples

## 1. Basic `run()`

```typescript
import { Codex } from "@openai/codex-sdk";

const codex = new Codex();
const thread = codex.startThread();

const turn = await thread.run("Diagnose why unit tests are failing");
console.log(turn.finalResponse);
console.log(turn.usage);
```

## 2. Continue a Thread

```typescript
await thread.run("Read the auth module and summarize risks");
const next = await thread.run("Implement the smallest safe fix");
console.log(next.finalResponse);
```

## 3. Stream Events with `runStreamed()`

```typescript
const { events } = await thread.runStreamed("Refactor and explain each step");

for await (const event of events) {
  switch (event.type) {
    case "item.completed":
      console.log("completed item:", event.item.type);
      break;
    case "turn.completed":
      console.log("usage:", event.usage);
      break;
    case "turn.failed":
      console.error("failure:", event.error.message);
      break;
  }
}
```

## 4. Structured Output

```typescript
const schema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    status: { type: "string", enum: ["ok", "action_required"] },
  },
  required: ["summary", "status"],
  additionalProperties: false,
} as const;

const turn = await thread.run("Summarize repository status", { outputSchema: schema });
console.log(turn.finalResponse); // JSON string matching schema
```

## 5. Structured Output with Zod

```typescript
import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";

const schema = z.object({
  summary: z.string(),
  status: z.enum(["ok", "action_required"]),
});

const turn = await thread.run("Summarize repository status", {
  outputSchema: zodToJsonSchema(schema, { target: "openAi" }),
});
```

## 6. Prompt + Local Images

```typescript
const turn = await thread.run([
  { type: "text", text: "Describe these screenshots" },
  { type: "local_image", path: "./ui.png" },
  { type: "local_image", path: "./diagram.jpg" },
]);
```

## 7. Resume Persisted Session

```typescript
const savedThreadId = process.env.CODEX_THREAD_ID!;
const resumed = codex.resumeThread(savedThreadId);
await resumed.run("Continue from where we left off");
```

## 8. Configure Working Directory and Sandbox

```typescript
const thread = codex.startThread({
  workingDirectory: "/path/to/project",
  sandboxMode: "workspace-write",
  approvalPolicy: "on-request",
  skipGitRepoCheck: true,
});
```

## 9. Restrict Environment Variables

```typescript
const codex = new Codex({
  env: {
    PATH: "/usr/local/bin",
    HOME: process.env.HOME ?? "",
  },
});
```

Note: `env` is a full replacement for inherited process environment.

## 10. Set Global Config Overrides

```typescript
const codex = new Codex({
  config: {
    approval_policy: "never",
    sandbox_workspace_write: { network_access: true },
  },
});

// Thread options can still override global config values for a specific thread.
const thread = codex.startThread({ approvalPolicy: "on-request" });
```

## 11. Parallel Instances with Different Env Vars + Permission Check

```typescript
import { Codex } from "@openai/codex-sdk";

const BASE_URL = process.env.PROXY_BASE_URL!;
const MODEL = "gpt-5.3-codex";

function mkCodex(apiKey: string, extraEnv: Record<string, string>) {
  return new Codex({
    baseUrl: BASE_URL,
    apiKey,
    env: { ...process.env, ...extraEnv },
  });
}

async function runAgent(codex: Codex, prompt: string, approvalPolicy: "never" | "on-request") {
  const thread = codex.startThread({
    model: MODEL,
    approvalPolicy,
    sandboxMode: "danger-full-access",
    skipGitRepoCheck: true,
  });
  return thread.run(prompt);
}

const [a, b] = await Promise.all([
  runAgent(
    mkCodex(process.env.OPENAI_API_KEY_A!, { AGENT_NAME: "alpha" }),
    "Run `echo $AGENT_NAME` and reply with output only.",
    "never",
  ),
  runAgent(
    mkCodex(process.env.OPENAI_API_KEY_B!, { AGENT_NAME: "beta" }),
    "Run `echo $AGENT_NAME` and reply with output only.",
    "never",
  ),
]);

console.log(a.finalResponse); // should contain alpha
console.log(b.finalResponse); // should contain beta

const permissionCheck = await runAgent(
  mkCodex(process.env.OPENAI_API_KEY_A!, { AGENT_NAME: "perm-test" }),
  "Run `echo PERMISSION_MARKER` and reply with output only.",
  "on-request",
);
console.log(permissionCheck.finalResponse);
```

In this repository, the end-to-end smoke implementation lives at `test-codex-parallel-env.mjs` and is runnable via `pnpm run test:codex:parallel`.
