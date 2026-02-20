export interface CodexProject {
  cwd: string;
  name: string;
  sessionCount: number;
  lastActivity: string;
}

export interface CodexSessionModelUsage {
  model: string;
  reasoningEffort: string;
}

export interface CodexSession {
  id: string;
  filePath: string;
  fileSizeBytes?: number;
  cwd: string;
  model: string;
  modelUsages: CodexSessionModelUsage[];
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

export interface CodexStatsTokenTotals {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
}

export type CodexStatsScope =
  | { type: 'all' }
  | {
    type: 'project';
    cwd: string;
  };

export interface CodexStatsDailyPoint extends CodexStatsTokenTotals {
  date: string;
  eventCount: number;
  sessionCount: number;
}

export interface CodexStatsHourlyPoint extends CodexStatsTokenTotals {
  hour: number;
  eventCount: number;
  sessionCount: number;
}

export interface CodexStatsTopDay {
  date: string;
  eventCount: number;
  sessionCount: number;
  totalTokens: number;
  outputTokens: number;
}

export interface CodexStatsTopHour {
  hour: number;
  eventCount: number;
  sessionCount: number;
  totalTokens: number;
  outputTokens: number;
}

export interface CodexModelRate {
  model: string;
  inputUsdPer1M: number;
  cachedInputUsdPer1M: number;
  outputUsdPer1M: number;
  reasoningOutputUsdPer1M: number;
}

export interface CodexModelRateCard {
  updatedAt: string | null;
  source: string | null;
  models: CodexModelRate[];
  warnings: string[];
}

export interface CodexStatsRatesRefreshResult extends CodexModelRateCard {
  refreshed: boolean;
}

export interface CodexStatsModelBreakdown extends CodexStatsTokenTotals {
  model: string;
  reasoningEffort: string;
  sessionCount: number;
  archivedSessionCount: number;
  estimatedCostUsd: number;
}

export interface CodexStatsReasoningEffortBreakdown extends CodexStatsTokenTotals {
  reasoningEffort: string;
  sessionCount: number;
  estimatedCostUsd: number;
}

export interface CodexStatsCostCoverage {
  pricedTokens: number;
  unpricedTokens: number;
  unpricedModels: string[];
}

export interface CodexStatsSummary {
  generatedAt: string;
  timezone: string;
  scope: CodexStatsScope;
  totals: CodexStatsTokenTotals & {
    sessions: number;
    archivedSessions: number;
    eventCount: number;
    durationMs: number;
    estimatedCostUsd: number;
  };
  daily: CodexStatsDailyPoint[];
  hourly: CodexStatsHourlyPoint[];
  topDays: CodexStatsTopDay[];
  topHours: CodexStatsTopHour[];
  models: CodexStatsModelBreakdown[];
  reasoningEfforts: CodexStatsReasoningEffortBreakdown[];
  costCoverage: CodexStatsCostCoverage;
  rates: Pick<CodexModelRateCard, 'updatedAt' | 'source'>;
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
