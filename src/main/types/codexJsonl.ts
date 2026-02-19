interface JsonRecord {
  [key: string]: unknown;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function hasString(obj: JsonRecord, key: string): boolean {
  return isString(obj[key]);
}

function hasOptionalString(obj: JsonRecord, key: string): boolean {
  return !(key in obj) || isString(obj[key]);
}

function hasOptionalRecord(obj: JsonRecord, key: string): boolean {
  return !(key in obj) || isRecord(obj[key]);
}

export interface SessionMetaGit {
  commit_hash?: string;
  branch?: string;
  repository_url?: string;
}

export interface SessionMetaEntry {
  type: 'session_meta';
  timestamp: string;
  payload: {
    id?: string;
    cwd?: string;
    originator?: string;
    cli_version?: string;
    model_provider?: string;
    model?: string;
    base_instructions?: string | JsonRecord;
    git?: SessionMetaGit;
  };
}

export interface ContentBlockInputText {
  type: 'input_text';
  text: string;
}

export interface ContentBlockOutputText {
  type: 'output_text';
  text: string;
}

export interface ContentBlockInputImage {
  type: 'input_image';
  image_url: string;
}

export interface ContentBlockUnknown {
  type: string;
  text?: string;
}

export type ContentBlock =
  | ContentBlockInputText
  | ContentBlockOutputText
  | ContentBlockInputImage
  | ContentBlockUnknown;

export function getContentBlockText(block: ContentBlock): string {
  if (!('text' in block)) {
    return '';
  }

  return isString(block.text) ? block.text : '';
}

export interface MessagePayload {
  type: 'message';
  role: 'developer' | 'user' | 'assistant';
  content: ContentBlock[];
}

export interface FunctionCallPayload {
  type: 'function_call';
  name: string;
  arguments: string;
  call_id: string;
}

export interface FunctionCallOutputPayload {
  type: 'function_call_output';
  call_id: string;
  output: string;
}

export interface ReasoningPayload {
  type: 'reasoning';
  summary: ReasoningSummaryItem[];
  encrypted_content?: string | null;
}

export type ResponseItemPayload =
  | MessagePayload
  | FunctionCallPayload
  | FunctionCallOutputPayload
  | ReasoningPayload;

export interface ResponseItemEntry {
  type: 'response_item';
  timestamp: string;
  payload: ResponseItemPayload;
}

export interface TurnContextEntry {
  type: 'turn_context';
  timestamp: string;
  payload: {
    turn_id?: string;
    cwd?: string;
    approval_policy?: string;
    sandbox_policy?: string | JsonRecord;
    model?: string;
    personality?: string;
    collaboration_mode?: string | JsonRecord;
    effort?: string;
    truncation_policy?: string | JsonRecord;
    summary?: string;
    user_instructions?: string;
  };
}

export interface ReasoningSummaryText {
  text: string;
}

export type ReasoningSummaryItem = string | ReasoningSummaryText;

function isReasoningSummaryText(value: unknown): value is ReasoningSummaryText {
  return isRecord(value) && hasString(value, 'text');
}

export function reasoningSummaryItemToText(item: ReasoningSummaryItem): string {
  return isString(item) ? item : item.text;
}

export function reasoningSummaryToText(summary: ReasoningSummaryItem[]): string[] {
  return summary.map(reasoningSummaryItemToText);
}

export interface TokenUsage {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_output_tokens: number;
  total_tokens: number;
}

export interface TokenCountPayload {
  type: 'token_count';
  info: {
    total_token_usage: TokenUsage;
    last_token_usage: TokenUsage;
    model_context_window: number;
  } | null;
  rate_limits: unknown;
}

export interface AgentReasoningPayload {
  type: 'agent_reasoning';
  text: string;
}

export interface AgentMessagePayload {
  type: 'agent_message';
  message: string;
}

export interface UserMessagePayload {
  type: 'user_message';
  message: string;
}

export type EventMsgPayload =
  | TokenCountPayload
  | AgentReasoningPayload
  | AgentMessagePayload
  | UserMessagePayload;

export interface EventMsgEntry {
  type: 'event_msg';
  timestamp: string;
  payload: EventMsgPayload;
}

export type CodexLogEntry =
  | SessionMetaEntry
  | ResponseItemEntry
  | TurnContextEntry
  | EventMsgEntry;

export function isContentBlockInputText(value: unknown): value is ContentBlockInputText {
  if (!isRecord(value)) {
    return false;
  }

  return value.type === 'input_text' && hasString(value, 'text');
}

export function isContentBlockOutputText(value: unknown): value is ContentBlockOutputText {
  if (!isRecord(value)) {
    return false;
  }

  return value.type === 'output_text' && hasString(value, 'text');
}

export function isContentBlockInputImage(value: unknown): value is ContentBlockInputImage {
  if (!isRecord(value)) {
    return false;
  }

  return value.type === 'input_image' && hasString(value, 'image_url');
}

export function isContentBlockUnknown(value: unknown): value is ContentBlockUnknown {
  if (!isRecord(value) || !hasString(value, 'type')) {
    return false;
  }

  if (value.type === 'input_text' || value.type === 'output_text' || value.type === 'input_image') {
    return false;
  }

  return !('text' in value) || isString(value.text);
}

export function isContentBlock(value: unknown): value is ContentBlock {
  return (
    isContentBlockInputText(value) ||
    isContentBlockOutputText(value) ||
    isContentBlockInputImage(value) ||
    isContentBlockUnknown(value)
  );
}

export function isMessagePayload(value: unknown): value is MessagePayload {
  if (!isRecord(value)) {
    return false;
  }

  if (
    value.type !== 'message' ||
    (value.role !== 'developer' && value.role !== 'user' && value.role !== 'assistant')
  ) {
    return false;
  }

  if (!Array.isArray(value.content)) {
    return false;
  }

  return value.content.every(isContentBlock);
}

export function isFunctionCallPayload(value: unknown): value is FunctionCallPayload {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.type === 'function_call' &&
    hasString(value, 'name') &&
    hasString(value, 'arguments') &&
    hasString(value, 'call_id')
  );
}

export function isFunctionCallOutputPayload(value: unknown): value is FunctionCallOutputPayload {
  if (!isRecord(value)) {
    return false;
  }

  return value.type === 'function_call_output' && hasString(value, 'call_id') && hasString(value, 'output');
}

export function isReasoningPayload(value: unknown): value is ReasoningPayload {
  if (!isRecord(value)) {
    return false;
  }

  if (value.type !== 'reasoning' || !Array.isArray(value.summary)) {
    return false;
  }

  if (!value.summary.every((item) => isString(item) || isReasoningSummaryText(item))) {
    return false;
  }

  return !('encrypted_content' in value) || isString(value.encrypted_content) || value.encrypted_content === null;
}

export function isResponseItemPayload(value: unknown): value is ResponseItemPayload {
  return (
    isMessagePayload(value) ||
    isFunctionCallPayload(value) ||
    isFunctionCallOutputPayload(value) ||
    isReasoningPayload(value)
  );
}

export function isTokenUsage(value: unknown): value is TokenUsage {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.input_tokens === 'number' &&
    typeof value.cached_input_tokens === 'number' &&
    typeof value.output_tokens === 'number' &&
    typeof value.reasoning_output_tokens === 'number' &&
    typeof value.total_tokens === 'number'
  );
}

export function isTokenCountPayload(value: unknown): value is TokenCountPayload {
  if (!isRecord(value) || value.type !== 'token_count') {
    return false;
  }

  if (value.info === null) {
    return true;
  }

  if (!isRecord(value.info)) {
    return false;
  }

  return (
    isTokenUsage(value.info.total_token_usage) &&
    isTokenUsage(value.info.last_token_usage) &&
    typeof value.info.model_context_window === 'number'
  );
}

export function isAgentReasoningPayload(value: unknown): value is AgentReasoningPayload {
  if (!isRecord(value)) {
    return false;
  }

  return value.type === 'agent_reasoning' && hasString(value, 'text');
}

export function isAgentMessagePayload(value: unknown): value is AgentMessagePayload {
  if (!isRecord(value)) {
    return false;
  }

  return value.type === 'agent_message' && hasString(value, 'message');
}

export function isUserMessagePayload(value: unknown): value is UserMessagePayload {
  if (!isRecord(value)) {
    return false;
  }

  return value.type === 'user_message' && hasString(value, 'message');
}

export function isEventMsgPayload(value: unknown): value is EventMsgPayload {
  return (
    isTokenCountPayload(value) ||
    isAgentReasoningPayload(value) ||
    isAgentMessagePayload(value) ||
    isUserMessagePayload(value)
  );
}

export function isSessionMetaEntry(value: unknown): value is SessionMetaEntry {
  if (!isRecord(value) || value.type !== 'session_meta' || !hasString(value, 'timestamp')) {
    return false;
  }

  if (!isRecord(value.payload)) {
    return false;
  }

  if (
    !hasOptionalString(value.payload, 'id') ||
    !hasOptionalString(value.payload, 'cwd') ||
    !hasOptionalString(value.payload, 'originator') ||
    !hasOptionalString(value.payload, 'cli_version') ||
    !hasOptionalString(value.payload, 'model_provider') ||
    !hasOptionalString(value.payload, 'model')
  ) {
    return false;
  }

  if ('base_instructions' in value.payload) {
    const baseInstructions = value.payload.base_instructions;
    if (!isString(baseInstructions) && !isRecord(baseInstructions)) {
      return false;
    }
  }

  if (!hasOptionalRecord(value.payload, 'git')) {
    return false;
  }

  if (isRecord(value.payload.git)) {
    if (
      !hasOptionalString(value.payload.git, 'commit_hash') ||
      !hasOptionalString(value.payload.git, 'branch') ||
      !hasOptionalString(value.payload.git, 'repository_url')
    ) {
      return false;
    }
  }

  return hasString(value.payload, 'id') || hasString(value.payload, 'cwd');
}

export function isResponseItemEntry(value: unknown): value is ResponseItemEntry {
  if (!isRecord(value) || value.type !== 'response_item' || !hasString(value, 'timestamp')) {
    return false;
  }

  return isResponseItemPayload(value.payload);
}

export function isTurnContextEntry(value: unknown): value is TurnContextEntry {
  if (!isRecord(value) || value.type !== 'turn_context' || !hasString(value, 'timestamp')) {
    return false;
  }

  if (!isRecord(value.payload)) {
    return false;
  }

  if (
    !hasOptionalString(value.payload, 'turn_id') ||
    !hasOptionalString(value.payload, 'cwd') ||
    !hasOptionalString(value.payload, 'approval_policy') ||
    !hasOptionalString(value.payload, 'model') ||
    !hasOptionalString(value.payload, 'personality') ||
    !hasOptionalString(value.payload, 'effort') ||
    !hasOptionalString(value.payload, 'summary') ||
    !hasOptionalString(value.payload, 'user_instructions')
  ) {
    return false;
  }

  const sandboxPolicy = value.payload.sandbox_policy;
  if (
    'sandbox_policy' in value.payload &&
    !(isString(sandboxPolicy) || isRecord(sandboxPolicy))
  ) {
    return false;
  }

  const collaborationMode = value.payload.collaboration_mode;
  if (
    'collaboration_mode' in value.payload &&
    !(isString(collaborationMode) || isRecord(collaborationMode))
  ) {
    return false;
  }

  const truncationPolicy = value.payload.truncation_policy;
  if (
    'truncation_policy' in value.payload &&
    !(isString(truncationPolicy) || isRecord(truncationPolicy))
  ) {
    return false;
  }

  return hasString(value.payload, 'cwd') || hasString(value.payload, 'model');
}

export function isEventMsgEntry(value: unknown): value is EventMsgEntry {
  if (!isRecord(value) || value.type !== 'event_msg' || !hasString(value, 'timestamp')) {
    return false;
  }

  return isEventMsgPayload(value.payload);
}

export function isCodexLogEntry(value: unknown): value is CodexLogEntry {
  return (
    isSessionMetaEntry(value) ||
    isResponseItemEntry(value) ||
    isTurnContextEntry(value) ||
    isEventMsgEntry(value)
  );
}
