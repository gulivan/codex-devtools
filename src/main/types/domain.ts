export interface CodexProject {
  cwd: string;
  name: string;
  sessionCount: number;
  lastActivity: string;
}

export interface CodexSession {
  id: string;
  filePath: string;
  cwd: string;
  model: string;
  cliVersion: string;
  gitBranch: string;
  gitCommit: string;
  startTime: string;
  modelProvider: string;
}

export interface CodexSessionMetrics {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  turnCount: number;
  toolCallCount: number;
  duration: number;
}

export type CodexSearchMatchKind =
  | 'user'
  | 'assistant'
  | 'developer'
  | 'function_call'
  | 'function_output'
  | 'reasoning'
  | 'event'
  | 'other';

export interface CodexSearchMatch {
  sessionId: string;
  cwd: string;
  timestamp: string;
  kind: CodexSearchMatchKind;
  content: string;
  snippet: string;
}

export interface CodexSearchSessionsResult {
  query: string;
  totalMatches: number;
  sessionsSearched: number;
  results: CodexSearchMatch[];
}

export const EMPTY_CODEX_SESSION_METRICS: CodexSessionMetrics = {
  totalTokens: 0,
  inputTokens: 0,
  outputTokens: 0,
  cachedTokens: 0,
  reasoningTokens: 0,
  turnCount: 0,
  toolCallCount: 0,
  duration: 0,
};
