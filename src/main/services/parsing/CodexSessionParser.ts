import * as path from 'node:path';

import {
  EMPTY_CODEX_SESSION_METRICS,
  type CodexLogEntry,
  type CodexSession,
  type CodexSessionModelUsage,
  type CodexSessionMetrics,
  type EventMsgEntry,
  type ResponseItemEntry,
  type SessionMetaEntry,
  type TokenUsage,
  type TurnContextEntry,
  diffTokenUsage,
  isCodexLogEntry,
  isEventMsgEntry,
  isMessagePayload,
  isResponseItemEntry,
  isSameTokenUsage,
  isSessionMetaEntry,
  isTokenCountPayload,
  isTurnContextEntry,
} from '@main/types';
import { parseJsonlFile } from '@main/utils/jsonl';

import { CodexMessageClassifier, type CodexClassifiedEntry } from './CodexMessageClassifier';

export interface CodexParsedSession {
  filePath: string;
  entries: CodexLogEntry[];
  sessionMeta: SessionMetaEntry | null;
  responseItems: ResponseItemEntry[];
  turnContexts: TurnContextEntry[];
  eventMessages: EventMsgEntry[];
  classifiedEntries: CodexClassifiedEntry[];
  session: CodexSession;
  metrics: CodexSessionMetrics;
}

function coerceTimestamp(value: string | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : value;
}

function parseTimestampMs(value: string): number {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function fallbackSessionIdFromFilePath(filePath: string): string {
  const fileName = path.basename(filePath);
  const match = fileName.match(/-([a-zA-Z0-9-]+)\.jsonl$/);
  return match?.[1] ?? fileName.replace(/\.jsonl$/, '');
}

function normalizeModel(model: string | undefined): string {
  return model?.trim() ?? '';
}

function normalizeReasoningEffort(effort: string | undefined): string {
  const value = effort?.trim();
  return value ? value : 'unknown';
}

export class CodexSessionParser {
  private readonly classifier: CodexMessageClassifier;

  constructor(classifier: CodexMessageClassifier = new CodexMessageClassifier()) {
    this.classifier = classifier;
  }

  async parseSessionFile(filePath: string): Promise<CodexParsedSession> {
    const entries = await parseJsonlFile<CodexLogEntry>(filePath, (value) =>
      isCodexLogEntry(value) ? value : null,
    );

    const responseItems: ResponseItemEntry[] = [];
    const turnContexts: TurnContextEntry[] = [];
    const eventMessages: EventMsgEntry[] = [];
    let sessionMeta: SessionMetaEntry | null = null;

    const metrics: CodexSessionMetrics = { ...EMPTY_CODEX_SESSION_METRICS };
    let firstTimestamp: string | null = null;
    let lastTimestamp: string | null = null;
    let firstTurnContextModel: string | null = null;
    let previousTotalUsage: TokenUsage | null = null;
    const modelUsages: CodexSessionModelUsage[] = [];
    const modelUsageKeys = new Set<string>();

    for (const entry of entries) {
      if (firstTimestamp === null) {
        firstTimestamp = entry.timestamp;
      }
      lastTimestamp = entry.timestamp;

      if (isSessionMetaEntry(entry) && sessionMeta === null) {
        sessionMeta = entry;
        continue;
      }

      if (isResponseItemEntry(entry)) {
        responseItems.push(entry);
        if (entry.payload.type === 'function_call') {
          metrics.toolCallCount += 1;
        }
        continue;
      }

      if (isTurnContextEntry(entry)) {
        turnContexts.push(entry);
        const model = normalizeModel(entry.payload.model);
        if (firstTurnContextModel === null && model) {
          firstTurnContextModel = model;
        }

        if (model) {
          const usage: CodexSessionModelUsage = {
            model,
            reasoningEffort: normalizeReasoningEffort(entry.payload.effort),
          };
          const usageKey = `${usage.model}::${usage.reasoningEffort}`;
          if (!modelUsageKeys.has(usageKey)) {
            modelUsageKeys.add(usageKey);
            modelUsages.push(usage);
          }
        }
        continue;
      }

      if (isEventMsgEntry(entry)) {
        eventMessages.push(entry);
        if (isTokenCountPayload(entry.payload) && entry.payload.info) {
          const currentTotal = entry.payload.info.total_token_usage;
          let usage: TokenUsage;
          if (previousTotalUsage) {
            const delta = diffTokenUsage(previousTotalUsage, currentTotal);
            if (delta) {
              usage = delta;
            } else if (isSameTokenUsage(previousTotalUsage, currentTotal)) {
              previousTotalUsage = currentTotal;
              continue;
            } else {
              usage = entry.payload.info.last_token_usage;
            }
          } else {
            usage = currentTotal;
          }

          previousTotalUsage = currentTotal;

          metrics.inputTokens += usage.input_tokens;
          metrics.cachedTokens += usage.cached_input_tokens;
          metrics.outputTokens += usage.output_tokens;
          metrics.reasoningTokens += usage.reasoning_output_tokens;
          metrics.totalTokens += usage.total_tokens;
        }
      }
    }

    const classifiedEntries = this.classifier.classifyEntries(entries);
    metrics.turnCount = classifiedEntries.filter((entry) => entry.kind === 'user').length;

    if (firstTimestamp && lastTimestamp) {
      metrics.duration = Math.max(parseTimestampMs(lastTimestamp) - parseTimestampMs(firstTimestamp), 0);
    }

    const fallbackStart = firstTimestamp ?? new Date(0).toISOString();
    const startTime = coerceTimestamp(sessionMeta?.timestamp, fallbackStart);
    const sessionMetaModel = normalizeModel(sessionMeta?.payload.model);
    if (sessionMetaModel && modelUsages.length === 0) {
      modelUsages.push({
        model: sessionMetaModel,
        reasoningEffort: 'unknown',
      });
    }

    const session: CodexSession = {
      id: sessionMeta?.payload.id ?? fallbackSessionIdFromFilePath(filePath),
      filePath,
      cwd: sessionMeta?.payload.cwd ?? turnContexts[0]?.payload.cwd ?? '',
      model: firstTurnContextModel ?? sessionMetaModel,
      modelUsages,
      cliVersion: sessionMeta?.payload.cli_version ?? '',
      gitBranch: sessionMeta?.payload.git?.branch ?? '',
      gitCommit: sessionMeta?.payload.git?.commit_hash ?? '',
      startTime,
      modelProvider: sessionMeta?.payload.model_provider ?? '',
    };

    return {
      filePath,
      entries,
      sessionMeta,
      responseItems,
      turnContexts,
      eventMessages,
      classifiedEntries,
      session,
      metrics,
    };
  }
}
