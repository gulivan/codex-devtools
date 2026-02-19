import { type CodexSessionMetrics } from './domain';

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
}

export interface UserChunk {
  type: 'user';
  content: string;
  timestamp: string;
}

export interface AIChunk {
  type: 'ai';
  textBlocks: string[];
  toolExecutions: CodexToolExecution[];
  reasoning: string[];
  metrics: Partial<CodexSessionMetrics>;
  timestamp: string;
  duration: number;
}

export interface SystemChunk {
  type: 'system';
  content: string;
  timestamp: string;
}

export type CodexChunk = UserChunk | AIChunk | SystemChunk;
