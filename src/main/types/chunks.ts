import { type CodexSessionMetrics } from './domain';

export interface CodexToolTokenUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

export type UserAttachmentKind = 'image' | 'text' | 'markdown' | 'code' | 'binary' | 'unknown';

export type UserAttachmentPreviewReason = 'unsupported_mime' | 'too_large' | 'decode_error' | 'binary';

export interface UserAttachment {
  id: string;
  source: 'response_item' | 'event_msg';
  mimeType: string;
  kind: UserAttachmentKind;
  encoding: 'base64' | 'plain';
  sizeBytes: number | null;
  previewable: boolean;
  previewReason?: UserAttachmentPreviewReason;
  dataUrl?: string;
  textContent?: string;
  fileName?: string | null;
}

export interface CodexToolExecution {
  functionCall: {
    name: string;
    arguments: string;
    callId: string;
  };
  functionOutput: {
    callId: string;
    output: string;
    isError: boolean;
  } | null;
  duration: number;
  tokenUsage: CodexToolTokenUsage | null;
}

export interface UserChunk {
  type: 'user';
  content: string;
  timestamp: string;
  attachments?: UserAttachment[];
}

export interface AIChunk {
  type: 'ai';
  textBlocks: string[];
  toolExecutions: CodexToolExecution[];
  reasoning: string[];
  sections?: AIChunkSection[];
  metrics: Partial<CodexSessionMetrics>;
  timestamp: string;
  duration: number;
}

export interface AIMessageSection {
  type: 'message';
  textBlocks: string[];
}

export interface AIReasoningSection {
  type: 'reasoning';
  summaries: string[];
}

export interface AIToolExecutionsSection {
  type: 'tool_executions';
  executions: CodexToolExecution[];
}

export type AIChunkSection = AIMessageSection | AIReasoningSection | AIToolExecutionsSection;

export interface SystemChunk {
  type: 'system';
  content: string;
  timestamp: string;
}

export interface ModelChangeChunk {
  type: 'model_change';
  previousModel: string;
  previousReasoningEffort: string;
  model: string;
  reasoningEffort: string;
  timestamp: string;
}

export interface CollaborationModeChangeChunk {
  type: 'collaboration_mode_change';
  previousMode: string;
  mode: string;
  timestamp: string;
}

export interface CompactionChunk {
  type: 'compaction';
  timestamp: string;
}

export type CodexChunk =
  | UserChunk
  | AIChunk
  | SystemChunk
  | ModelChangeChunk
  | CollaborationModeChangeChunk
  | CompactionChunk;
