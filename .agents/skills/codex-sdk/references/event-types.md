# Event Types

`runStreamed()` yields `ThreadEvent` values.

## `ThreadEvent` Union

```typescript
type ThreadEvent =
  | ThreadStartedEvent
  | TurnStartedEvent
  | TurnCompletedEvent
  | TurnFailedEvent
  | ItemStartedEvent
  | ItemUpdatedEvent
  | ItemCompletedEvent
  | ThreadErrorEvent;
```

## Event Payloads

### `thread.started`

```typescript
type ThreadStartedEvent = {
  type: "thread.started";
  thread_id: string;
};
```

Set `thread.id` from `thread_id` if persisting session context.

### `turn.started`

```typescript
type TurnStartedEvent = {
  type: "turn.started";
};
```

### `turn.completed`

```typescript
type Usage = {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
};

type TurnCompletedEvent = {
  type: "turn.completed";
  usage: Usage;
};
```

### `turn.failed`

```typescript
type ThreadError = {
  message: string;
};

type TurnFailedEvent = {
  type: "turn.failed";
  error: ThreadError;
};
```

`run()` throws with `error.message` when this event occurs.

### `item.started`

```typescript
type ItemStartedEvent = {
  type: "item.started";
  item: ThreadItem;
};
```

### `item.updated`

```typescript
type ItemUpdatedEvent = {
  type: "item.updated";
  item: ThreadItem;
};
```

### `item.completed`

```typescript
type ItemCompletedEvent = {
  type: "item.completed";
  item: ThreadItem;
};
```

### `error` (fatal stream error)

```typescript
type ThreadErrorEvent = {
  type: "error";
  message: string;
};
```

## Handling Pattern

```typescript
const { events } = await thread.runStreamed(prompt);

for await (const event of events) {
  switch (event.type) {
    case "thread.started":
      console.log("thread", event.thread_id);
      break;
    case "item.started":
    case "item.updated":
    case "item.completed":
      console.log("item", event.item.type);
      break;
    case "turn.completed":
      console.log("usage", event.usage);
      break;
    case "turn.failed":
      console.error("turn failed", event.error.message);
      break;
    case "error":
      console.error("fatal stream error", event.message);
      break;
  }
}
```

## `run()` Aggregation Behavior

`thread.run()` internally iterates the same event stream and:
- Collects `item.completed` items.
- Sets `finalResponse` from the latest completed `agent_message`.
- Captures `usage` from `turn.completed`.
- Throws if `turn.failed` appears.
