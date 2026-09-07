/** The inspector's transport-neutral contract. No renderer/runtime dependencies. */
export interface InspectorSession {
  id: string;
  filePath: string;
  cwd: string;
  startTime: string;
  model: string;
  modelProvider?: string;
  cliVersion?: string;
  gitBranch?: string;
  title?: string;
}
export type TraceKind = 'message' | 'tool' | 'command' | 'reasoning' | 'event';
export interface RolloutEnvelope { timestamp: string; type: string; payload: Record<string, unknown> }
export interface TraceRow {
  id: string;
  timestamp: string;
  kind: TraceKind;
  name: string;
  eventType: string;
  model: string;
  detail: string;
  callId?: string;
  durationMs: number | null;
  tokens: number | null;
  status: 'recorded' | 'completed' | 'failed' | 'running';
}
export interface TokenTotals {
  input: number; // Total input, INCLUDING cached input.
  cached: number;
  output: number; // Includes reasoning output.
  reasoning: number;
  cacheWrite: number;
}
export interface UsageSample extends TokenTotals {
  timestamp: string;
  model: string;
  turnId: string;
  responseId?: string;
  source: 'response' | 'counter';
}
export interface ModelRate {
  model: string;
  inputUsdPer1M: number;
  cachedInputUsdPer1M: number;
  outputUsdPer1M: number;
  reasoningOutputUsdPer1M: number;
}
export interface InspectorRateCard { models: ModelRate[]; updatedAt?: string | null; source?: string | null }
export interface SessionAnalysis {
  session: InspectorSession;
  rows: TraceRow[];
  samples: UsageSample[];
  warnings: string[];
  totals: TokenTotals;
  durationMs: number;
}
export interface TraceQuery { sessionId: string; kind?: TraceKind; search?: string; offset?: number; limit?: number }
export interface TraceResult {
  session: InspectorSession;
  rows: TraceRow[];
  total: number;
  counts: Record<TraceKind, number>;
  offset: number;
  limit: number;
  totals: TokenTotals;
  durationMs: number;
  warnings: string[];
  timeline: { timestamp: string; kind: TraceKind }[];
}
export interface StatsQuery {
  cwd?: string;
  model?: string;
  from?: string;
  to?: string;
  bucket?: 'hour' | 'day' | 'week';
  timezone?: string;
  groupByModel?: boolean;
}
export interface TimePoint {
  key: string;
  cached: number;
  input: number; // UNCACHED input, disjoint from the cached series.
  output: number;
  price: number | null; // Null = incomplete pricing, never a fabricated zero.
  knownPrice: number;
  unpricedTokens: number;
}
export interface StatsResult {
  generatedAt: string;
  timezone: string;
  models: string[];
  series: { model: string; points: TimePoint[] }[];
  hourly: { hour: number; events: number; tokens: number }[];
  totals: TokenTotals & { knownPrice: number; unpricedTokens: number; sessions: number; events: number };
  modelBreakdown: { model: string; tokens: number; price: number | null; cachedPercent: number }[];
  warnings: string[];
  ratesUpdatedAt: string | null;
  ratesSource: string | null;
  activityScope: 'all-models' | 'selected-model';
}
export interface ConfigSource {
  path: string;
  scope: 'user' | 'project';
  status: 'read' | 'missing' | 'error';
  settings: Record<string, string | number | boolean>;
  profiles: { name: string; settings: Record<string, string | number | boolean> }[];
}
export interface InstalledSkill { name: string; path: string; scope: string; enabled: boolean | null }
export interface InstalledMcp {
  name: string; source: string; enabled: boolean; transport: string;
  endpoint: string; argumentCount: number; environmentNames: string[];
}
export interface InstalledProvider { id: string; name: string; source: string; endpoint: string; wireApi: string; credentialVariable: string | null }
export interface InstallationResult {
  home: string;
  cliVersion: string | null;
  configSources: ConfigSource[];
  skills: InstalledSkill[];
  mcp: InstalledMcp[];
  providers: InstalledProvider[];
  warnings: string[];
}
export interface InspectorApi {
  getInspectorSessions(): Promise<InspectorSession[]>;
  getInspectorTrace(query: TraceQuery): Promise<TraceResult>;
  getInspectorStats(query: StatsQuery): Promise<StatsResult>;
  getInspectorInstallation(query: { cwd?: string }): Promise<InstallationResult>;
  onFileChange?: (listener: () => void) => () => void;
}
