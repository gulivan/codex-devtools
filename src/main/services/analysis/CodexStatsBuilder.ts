import type { CodexParsedSession } from '@main/services/parsing';
import {
  type CodexModelRate,
  type CodexModelRateCard,
  type CodexSessionModelUsage,
  type CodexStatsDailyPoint,
  type CodexStatsHourlyPoint,
  type CodexStatsModelBreakdown,
  type CodexStatsReasoningEffortBreakdown,
  type CodexStatsScope,
  type CodexStatsSummary,
  type CodexStatsTokenTotals,
  type TokenUsage,
  isEventMsgEntry,
  resolveTokenUsage,
  isTokenCountPayload,
  isTurnContextEntry,
} from '@main/types';

export interface CodexStatsSessionModelTokenTotals extends CodexStatsTokenTotals {
  model: string;
  reasoningEffort: string;
}

export interface CodexStatsSessionDailyBucket extends CodexStatsTokenTotals {
  date: string;
  eventCount: number;
}

export interface CodexStatsSessionHourlyBucket extends CodexStatsTokenTotals {
  hour: number;
  eventCount: number;
}

export interface CodexStatsSessionRecord {
  tokenComputationVersion?: number;
  sessionId: string;
  filePath: string;
  revision: string;
  archived: boolean;
  cwd: string;
  startTime: string;
  lastActivity: string;
  modelUsages: CodexSessionModelUsage[];
  eventCount: number;
  turnCount: number;
  toolCallCount: number;
  durationMs: number;
  tokens: CodexStatsTokenTotals;
  modelTokenTotals: CodexStatsSessionModelTokenTotals[];
  dailyBuckets: CodexStatsSessionDailyBucket[];
  hourlyBuckets: CodexStatsSessionHourlyBucket[];
  lastSeenAt: string;
}

interface DailyAccumulator extends CodexStatsTokenTotals {
  date: string;
  eventCount: number;
  sessions: Set<string>;
}

interface HourlyAccumulator extends CodexStatsTokenTotals {
  hour: number;
  eventCount: number;
  sessions: Set<string>;
}

interface ModelAccumulator extends CodexStatsTokenTotals {
  model: string;
  reasoningEffort: string;
  estimatedCostUsd: number;
  sessions: Set<string>;
  archivedSessions: Set<string>;
}
interface ReasoningAccumulator extends CodexStatsTokenTotals {
  reasoningEffort: string;
  estimatedCostUsd: number;
  sessions: Set<string>;
}

function normalizeRateKey(model: string): string {
  return model.trim().toLowerCase();
}

function createZeroTokenTotals(): CodexStatsTokenTotals {
  return {
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    reasoningTokens: 0,
  };
}

function addTokenTotals(target: CodexStatsTokenTotals, source: CodexStatsTokenTotals): void {
  target.totalTokens += source.totalTokens;
  target.inputTokens += source.inputTokens;
  target.outputTokens += source.outputTokens;
  target.cachedTokens += source.cachedTokens;
  target.reasoningTokens += source.reasoningTokens;
}

function tokenUsageToTotals(usage: TokenUsage): CodexStatsTokenTotals {
  return {
    totalTokens: usage.total_tokens,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cachedTokens: usage.cached_input_tokens,
    reasoningTokens: usage.reasoning_output_tokens,
  };
}

function parseTimestamp(timestamp: string): Date | null {
  const value = new Date(timestamp);
  return Number.isNaN(value.getTime()) ? null : value;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localHour(date: Date): number {
  return date.getHours();
}

function ensureDailyBucket(
  buckets: Map<string, CodexStatsSessionDailyBucket>,
  date: string,
): CodexStatsSessionDailyBucket {
  const existing = buckets.get(date);
  if (existing) {
    return existing;
  }

  const next: CodexStatsSessionDailyBucket = {
    date,
    eventCount: 0,
    ...createZeroTokenTotals(),
  };

  buckets.set(date, next);
  return next;
}

function ensureHourlyBucket(
  buckets: Map<number, CodexStatsSessionHourlyBucket>,
  hour: number,
): CodexStatsSessionHourlyBucket {
  const existing = buckets.get(hour);
  if (existing) {
    return existing;
  }

  const next: CodexStatsSessionHourlyBucket = {
    hour,
    eventCount: 0,
    ...createZeroTokenTotals(),
  };

  buckets.set(hour, next);
  return next;
}

function ensureModelBucket(
  buckets: Map<string, CodexStatsSessionModelTokenTotals>,
  model: string,
  reasoningEffort: string,
): CodexStatsSessionModelTokenTotals {
  const key = `${normalizeRateKey(model)}::${normalizeReasoningEffort(reasoningEffort)}`;
  const existing = buckets.get(key);
  if (existing) {
    return existing;
  }

  const next: CodexStatsSessionModelTokenTotals = {
    model,
    reasoningEffort,
    ...createZeroTokenTotals(),
  };

  buckets.set(key, next);
  return next;
}

function estimateUsageCostUsd(tokens: CodexStatsTokenTotals, rate: CodexModelRate): number {
  const nonReasoningOutput = Math.max(tokens.outputTokens - tokens.reasoningTokens, 0);
  const outputCost = (nonReasoningOutput / 1_000_000) * rate.outputUsdPer1M;
  const reasoningCost = (tokens.reasoningTokens / 1_000_000) * rate.reasoningOutputUsdPer1M;

  return (
    (tokens.inputTokens / 1_000_000) * rate.inputUsdPer1M
    + (tokens.cachedTokens / 1_000_000) * rate.cachedInputUsdPer1M
    + outputCost
    + reasoningCost
  );
}

function buildRateLookup(rateCard: CodexModelRateCard): Map<string, CodexModelRate> {
  const lookup = new Map<string, CodexModelRate>();
  for (const rate of rateCard.models) {
    lookup.set(normalizeRateKey(rate.model), rate);
  }

  return lookup;
}

function buildHourlyResult(hourly: Map<number, HourlyAccumulator>): CodexStatsHourlyPoint[] {
  const result: CodexStatsHourlyPoint[] = [];

  for (let hour = 0; hour <= 23; hour += 1) {
    const current = hourly.get(hour);
    if (!current) {
      result.push({
        hour,
        eventCount: 0,
        sessionCount: 0,
        ...createZeroTokenTotals(),
      });
      continue;
    }

    result.push({
      hour,
      eventCount: current.eventCount,
      sessionCount: current.sessions.size,
      totalTokens: current.totalTokens,
      inputTokens: current.inputTokens,
      outputTokens: current.outputTokens,
      cachedTokens: current.cachedTokens,
      reasoningTokens: current.reasoningTokens,
    });
  }

  return result;
}

function normalizeModel(model: string | undefined): string {
  const trimmed = model?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'unknown-model';
}

function normalizeReasoningEffort(reasoningEffort: string | undefined): string {
  const trimmed = reasoningEffort?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'unknown';
}

export function buildSessionStatsRecord(
  parsed: CodexParsedSession,
  revision: string,
  nowIso: string,
): CodexStatsSessionRecord {
  const dailyBuckets = new Map<string, CodexStatsSessionDailyBucket>();
  const hourlyBuckets = new Map<number, CodexStatsSessionHourlyBucket>();
  const modelBuckets = new Map<string, CodexStatsSessionModelTokenTotals>();

  const tokens = createZeroTokenTotals();
  let eventCount = 0;
  let currentModel = normalizeModel(parsed.session.model || parsed.sessionMeta?.payload.model);
  let currentReasoningEffort = 'unknown';
  let previousTotalUsage: TokenUsage | null = null;

  for (const modelUsage of parsed.session.modelUsages) {
    if (modelUsage.model) {
      currentModel = normalizeModel(modelUsage.model);
      currentReasoningEffort = normalizeReasoningEffort(modelUsage.reasoningEffort);
      break;
    }
  }

  for (const entry of parsed.entries) {
    if (isTurnContextEntry(entry)) {
      if (entry.payload.model) {
        currentModel = normalizeModel(entry.payload.model);
      }

      currentReasoningEffort = normalizeReasoningEffort(entry.payload.effort);
      continue;
    }

    if (!isEventMsgEntry(entry) || !isTokenCountPayload(entry.payload) || !entry.payload.info) {
      continue;
    }

    const timestamp = parseTimestamp(entry.timestamp);
    const currentTotal = entry.payload.info.total_token_usage;
    const usage = resolveTokenUsage(previousTotalUsage, currentTotal, entry.payload.info.last_token_usage);

    previousTotalUsage = currentTotal;
    if (!usage) {
      continue;
    }

    const usageTotals = tokenUsageToTotals(usage);

    addTokenTotals(tokens, usageTotals);

    const modelTotals = ensureModelBucket(modelBuckets, currentModel, currentReasoningEffort);
    addTokenTotals(modelTotals, usageTotals);

    if (!timestamp) {
      continue;
    }

    const dateBucket = ensureDailyBucket(dailyBuckets, localDateKey(timestamp));
    addTokenTotals(dateBucket, usageTotals);

    const hourBucket = ensureHourlyBucket(hourlyBuckets, localHour(timestamp));
    addTokenTotals(hourBucket, usageTotals);
  }

  for (const classifiedEntry of parsed.classifiedEntries) {
    const timestamp = parseTimestamp(classifiedEntry.entry.timestamp);
    if (!timestamp) {
      continue;
    }

    eventCount += 1;
    const dateBucket = ensureDailyBucket(dailyBuckets, localDateKey(timestamp));
    dateBucket.eventCount += 1;

    const hourBucket = ensureHourlyBucket(hourlyBuckets, localHour(timestamp));
    hourBucket.eventCount += 1;
  }

  const lastActivity = parsed.entries[parsed.entries.length - 1]?.timestamp ?? parsed.session.startTime;

  return {
    tokenComputationVersion: 4,
    sessionId: parsed.session.id,
    filePath: parsed.session.filePath,
    revision,
    archived: false,
    cwd: parsed.session.cwd,
    startTime: parsed.session.startTime,
    lastActivity,
    modelUsages: parsed.session.modelUsages,
    eventCount,
    turnCount: parsed.metrics.turnCount,
    toolCallCount: parsed.metrics.toolCallCount,
    durationMs: parsed.metrics.duration,
    tokens,
    modelTokenTotals: Array.from(modelBuckets.values()).sort((a, b) => b.totalTokens - a.totalTokens),
    dailyBuckets: Array.from(dailyBuckets.values()).sort((a, b) => a.date.localeCompare(b.date)),
    hourlyBuckets: Array.from(hourlyBuckets.values()).sort((a, b) => a.hour - b.hour),
    lastSeenAt: nowIso,
  };
}

export function aggregateStatsSummary(
  records: CodexStatsSessionRecord[],
  scope: CodexStatsScope,
  rateCard: CodexModelRateCard,
): CodexStatsSummary {
  const scopedRecords = records.filter((record) => {
    if (scope.type === 'all') {
      return true;
    }

    return record.cwd === scope.cwd;
  });

  const daily = new Map<string, DailyAccumulator>();
  const hourly = new Map<number, HourlyAccumulator>();
  const modelBreakdown = new Map<string, ModelAccumulator>();
  const rateLookup = buildRateLookup(rateCard);
  const unpricedModels = new Set<string>();
  const totals = {
    sessions: 0,
    archivedSessions: 0,
    eventCount: 0,
    durationMs: 0,
    estimatedCostUsd: 0,
    ...createZeroTokenTotals(),
  };

  const costCoverage = {
    pricedTokens: 0,
    unpricedTokens: 0,
    unpricedModels: [] as string[],
  };

  for (const record of scopedRecords) {
    totals.sessions += 1;
    if (record.archived) {
      totals.archivedSessions += 1;
    }

    totals.eventCount += record.eventCount;
    totals.durationMs += record.durationMs;
    addTokenTotals(totals, record.tokens);

    for (const bucket of record.dailyBuckets) {
      const existing = daily.get(bucket.date) ?? {
        date: bucket.date,
        eventCount: 0,
        sessions: new Set<string>(),
        ...createZeroTokenTotals(),
      };

      existing.eventCount += bucket.eventCount;
      addTokenTotals(existing, bucket);
      existing.sessions.add(record.sessionId);
      daily.set(bucket.date, existing);
    }

    for (const bucket of record.hourlyBuckets) {
      const existing = hourly.get(bucket.hour) ?? {
        hour: bucket.hour,
        eventCount: 0,
        sessions: new Set<string>(),
        ...createZeroTokenTotals(),
      };

      existing.eventCount += bucket.eventCount;
      addTokenTotals(existing, bucket);
      existing.sessions.add(record.sessionId);
      hourly.set(bucket.hour, existing);
    }

    for (const modelTotals of record.modelTokenTotals) {
      const rate = rateLookup.get(normalizeRateKey(modelTotals.model));
      const modelKey = `${normalizeRateKey(modelTotals.model)}::${normalizeReasoningEffort(modelTotals.reasoningEffort)}`;
      const existing = modelBreakdown.get(modelKey) ?? {
        model: modelTotals.model,
        reasoningEffort: modelTotals.reasoningEffort,
        estimatedCostUsd: 0,
        sessions: new Set<string>(),
        archivedSessions: new Set<string>(),
        ...createZeroTokenTotals(),
      };

      addTokenTotals(existing, modelTotals);
      existing.sessions.add(record.sessionId);
      if (record.archived) {
        existing.archivedSessions.add(record.sessionId);
      }

      if (rate) {
        const usageCost = estimateUsageCostUsd(modelTotals, rate);
        existing.estimatedCostUsd += usageCost;
        totals.estimatedCostUsd += usageCost;
        costCoverage.pricedTokens += modelTotals.totalTokens;
      } else {
        costCoverage.unpricedTokens += modelTotals.totalTokens;
        unpricedModels.add(modelTotals.model);
      }

      modelBreakdown.set(modelKey, existing);
    }
  }

  const dailyPoints: CodexStatsDailyPoint[] = Array.from(daily.values())
    .map((bucket) => ({
      date: bucket.date,
      eventCount: bucket.eventCount,
      sessionCount: bucket.sessions.size,
      totalTokens: bucket.totalTokens,
      inputTokens: bucket.inputTokens,
      outputTokens: bucket.outputTokens,
      cachedTokens: bucket.cachedTokens,
      reasoningTokens: bucket.reasoningTokens,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const hourlyPoints = buildHourlyResult(hourly);

  const models: CodexStatsModelBreakdown[] = Array.from(modelBreakdown.values())
    .map((model) => ({
      model: model.model,
      reasoningEffort: model.reasoningEffort,
      sessionCount: model.sessions.size,
      archivedSessionCount: model.archivedSessions.size,
      estimatedCostUsd: Number(model.estimatedCostUsd.toFixed(6)),
      totalTokens: model.totalTokens,
      inputTokens: model.inputTokens,
      outputTokens: model.outputTokens,
      cachedTokens: model.cachedTokens,
      reasoningTokens: model.reasoningTokens,
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens);

  const reasoningMap = new Map<string, ReasoningAccumulator>();
  for (const model of modelBreakdown.values()) {
    const existing = reasoningMap.get(model.reasoningEffort) ?? {
      reasoningEffort: model.reasoningEffort,
      estimatedCostUsd: 0,
      sessions: new Set<string>(),
      ...createZeroTokenTotals(),
    };

    for (const sessionId of model.sessions) {
      existing.sessions.add(sessionId);
    }
    existing.estimatedCostUsd += model.estimatedCostUsd;
    addTokenTotals(existing, model);
    reasoningMap.set(model.reasoningEffort, existing);
  }

  const reasoningEfforts: CodexStatsReasoningEffortBreakdown[] = Array.from(reasoningMap.values())
    .map((reasoning) => ({
      reasoningEffort: reasoning.reasoningEffort,
      sessionCount: reasoning.sessions.size,
      estimatedCostUsd: Number(reasoning.estimatedCostUsd.toFixed(6)),
      totalTokens: reasoning.totalTokens,
      inputTokens: reasoning.inputTokens,
      outputTokens: reasoning.outputTokens,
      cachedTokens: reasoning.cachedTokens,
      reasoningTokens: reasoning.reasoningTokens,
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens);

  const topDays = [...dailyPoints]
    .sort((a, b) => b.eventCount - a.eventCount || b.totalTokens - a.totalTokens)
    .slice(0, 5)
    .map((day) => ({
      date: day.date,
      eventCount: day.eventCount,
      sessionCount: day.sessionCount,
      totalTokens: day.totalTokens,
      outputTokens: day.outputTokens,
    }));

  const topHours = [...hourlyPoints]
    .sort((a, b) => b.eventCount - a.eventCount || b.totalTokens - a.totalTokens)
    .slice(0, 5)
    .map((hour) => ({
      hour: hour.hour,
      eventCount: hour.eventCount,
      sessionCount: hour.sessionCount,
      totalTokens: hour.totalTokens,
      outputTokens: hour.outputTokens,
    }));

  return {
    generatedAt: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local',
    scope,
    totals: {
      ...totals,
      estimatedCostUsd: Number(totals.estimatedCostUsd.toFixed(6)),
    },
    daily: dailyPoints,
    hourly: hourlyPoints,
    topDays,
    topHours,
    models,
    reasoningEfforts,
    costCoverage: {
      pricedTokens: costCoverage.pricedTokens,
      unpricedTokens: costCoverage.unpricedTokens,
      unpricedModels: Array.from(unpricedModels.values()).sort((a, b) => a.localeCompare(b)),
    },
    rates: {
      updatedAt: rateCard.updatedAt,
      source: rateCard.source,
    },
  };
}
