# Item Types

`ThreadItem` payloads appear on `item.started`, `item.updated`, and `item.completed`.

## `ThreadItem` Union

```typescript
type ThreadItem =
  | AgentMessageItem
  | ReasoningItem
  | CommandExecutionItem
  | FileChangeItem
  | McpToolCallItem
  | WebSearchItem
  | TodoListItem
  | ErrorItem;
```

## Item Variants

### `agent_message`

```typescript
type AgentMessageItem = {
  id: string;
  type: "agent_message";
  text: string;
};
```

Natural language text or JSON string when structured output is requested.

### `reasoning`

```typescript
type ReasoningItem = {
  id: string;
  type: "reasoning";
  text: string;
};
```

### `command_execution`

```typescript
type CommandExecutionStatus = "in_progress" | "completed" | "failed";

type CommandExecutionItem = {
  id: string;
  type: "command_execution";
  command: string;
  aggregated_output: string;
  exit_code?: number;
  status: CommandExecutionStatus;
};
```

### `file_change`

```typescript
type PatchChangeKind = "add" | "delete" | "update";
type PatchApplyStatus = "completed" | "failed";

type FileUpdateChange = {
  path: string;
  kind: PatchChangeKind;
};

type FileChangeItem = {
  id: string;
  type: "file_change";
  changes: FileUpdateChange[];
  status: PatchApplyStatus;
};
```

### `mcp_tool_call`

```typescript
type McpToolCallStatus = "in_progress" | "completed" | "failed";

type McpToolCallItem = {
  id: string;
  type: "mcp_tool_call";
  server: string;
  tool: string;
  arguments: unknown;
  result?: {
    content: McpContentBlock[];
    structured_content: unknown;
  };
  error?: {
    message: string;
  };
  status: McpToolCallStatus;
};
```

### `web_search`

```typescript
type WebSearchItem = {
  id: string;
  type: "web_search";
  query: string;
};
```

### `todo_list`

```typescript
type TodoItem = {
  text: string;
  completed: boolean;
};

type TodoListItem = {
  id: string;
  type: "todo_list";
  items: TodoItem[];
};
```

### `error`

```typescript
type ErrorItem = {
  id: string;
  type: "error";
  message: string;
};
```

## Item Processing Pattern

```typescript
function handleItem(item: ThreadItem) {
  switch (item.type) {
    case "agent_message":
      console.log(item.text);
      break;
    case "command_execution":
      console.log(item.command, item.status, item.exit_code);
      break;
    case "file_change":
      for (const change of item.changes) {
        console.log(change.kind, change.path);
      }
      break;
    case "todo_list":
      for (const todo of item.items) {
        console.log(todo.completed ? "[x]" : "[ ]", todo.text);
      }
      break;
  }
}
```
