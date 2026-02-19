import {
  type AIChunk,
  type CodexChunk,
  type CodexLogEntry,
  type CodexSessionMetrics,
  type CodexToolExecution,
  type EventMsgEntry,
  getContentBlockText,
  isAgentMessagePayload,
  isAgentReasoningPayload,
  isEventMsgEntry,
  isFunctionCallOutputPayload,
  isFunctionCallPayload,
  isMessagePayload,
  isReasoningPayload,
  isResponseItemEntry,
  isTokenCountPayload,
  isUserMessagePayload,
  reasoningSummaryToText,
} from '@main/types';

import { CodexMessageClassifier } from '../parsing/CodexMessageClassifier';

interface InProgressAIChunk {
  startTimeMs: number;
  endTimeMs: number;
  timestamp: string;
  responseTextBlocks: string[];
  eventTextBlocks: string[];
  toolExecutions: CodexToolExecution[];
  responseReasoning: string[];
  eventReasoning: string[];
  metrics: Partial<CodexSessionMetrics>;
  callIndexById: Map<string, { index: number; startTimeMs: number }>;
}

interface PendingUserEvent {
  content: string;
  timestamp: string;
}

function parseTimestampMs(timestamp: string): number {
  const ms = new Date(timestamp).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function normalizeComparableText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function pushUniqueAdjacent(blocks: string[], value: string): void {
  const text = value.trim();
  if (!text) {
    return;
  }

  const last = blocks[blocks.length - 1];
  if (last && normalizeComparableText(last) === normalizeComparableText(text)) {
    return;
  }

  blocks.push(text);
}

function pickPreferredBlocks(primary: string[], fallback: string[]): string[] {
  const source = primary.length > 0 ? primary : fallback;
  const deduped: string[] = [];
  for (const block of source) {
    pushUniqueAdjacent(deduped, block);
  }
  return deduped;
}

function toUserContent(entry: CodexLogEntry): string {
  if (isResponseItemEntry(entry) && isMessagePayload(entry.payload) && entry.payload.role === 'user') {
    return entry.payload.content.map(getContentBlockText).filter(Boolean).join('\n');
  }

  if (isEventMsgEntry(entry) && isUserMessagePayload(entry.payload)) {
    return entry.payload.message;
  }

  return '';
}

function parseToolOutputError(output: string): boolean {
  try {
    const parsed = JSON.parse(output) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      return false;
    }

    const outputRecord = parsed as Record<string, unknown>;
    if (typeof outputRecord.is_error === 'boolean') {
      return outputRecord.is_error;
    }

    if (typeof outputRecord.exit_code === 'number') {
      return outputRecord.exit_code !== 0;
    }

    const metadata = outputRecord.metadata;
    if (typeof metadata === 'object' && metadata !== null) {
      const metadataRecord = metadata as Record<string, unknown>;
      if (typeof metadataRecord.exit_code === 'number') {
        return metadataRecord.exit_code !== 0;
      }
    }
  } catch {
    // Output is not guaranteed to be JSON.
  }

  return false;
}

export class CodexChunkBuilder {
  private readonly classifier: CodexMessageClassifier;

  constructor(classifier: CodexMessageClassifier = new CodexMessageClassifier()) {
    this.classifier = classifier;
  }

  buildChunks(entries: CodexLogEntry[]): CodexChunk[] {
    const sortedEntries = [...entries].sort(
      (a, b) => parseTimestampMs(a.timestamp) - parseTimestampMs(b.timestamp),
    );
    const chunks: CodexChunk[] = [];
    let currentAI: InProgressAIChunk | null = null;
    let pendingEventUser: PendingUserEvent | null = null;

    const flushAIChunk = (): void => {
      if (!currentAI) {
        return;
      }

      const textBlocks = pickPreferredBlocks(currentAI.responseTextBlocks, currentAI.eventTextBlocks);
      const reasoning = pickPreferredBlocks(currentAI.responseReasoning, currentAI.eventReasoning);

      if (
        textBlocks.length === 0 &&
        reasoning.length === 0 &&
        currentAI.toolExecutions.length === 0
      ) {
        currentAI = null;
        return;
      }

      const aiChunk: AIChunk = {
        type: 'ai',
        textBlocks,
        toolExecutions: currentAI.toolExecutions,
        reasoning,
        metrics: {
          ...currentAI.metrics,
          toolCallCount: currentAI.toolExecutions.length,
        },
        timestamp: currentAI.timestamp,
        duration: Math.max(currentAI.endTimeMs - currentAI.startTimeMs, 0),
      };
      chunks.push(aiChunk);
      currentAI = null;
    };

    const ensureAIChunk = (timestamp: string): InProgressAIChunk => {
      if (currentAI) {
        return currentAI;
      }

      const at = parseTimestampMs(timestamp);
      currentAI = {
        startTimeMs: at,
        endTimeMs: at,
        timestamp,
        responseTextBlocks: [],
        eventTextBlocks: [],
        toolExecutions: [],
        responseReasoning: [],
        eventReasoning: [],
        metrics: {},
        callIndexById: new Map(),
      };
      return currentAI;
    };

    const flushPendingEventUser = (): void => {
      if (!pendingEventUser) {
        return;
      }

      chunks.push({
        type: 'user',
        content: pendingEventUser.content,
        timestamp: pendingEventUser.timestamp,
      });
      pendingEventUser = null;
    };

    for (const entry of sortedEntries) {
      const timestampMs = parseTimestampMs(entry.timestamp);

      if (isEventMsgEntry(entry) && isUserMessagePayload(entry.payload)) {
        flushAIChunk();
        const content = entry.payload.message.trim();
        if (!content) {
          continue;
        }

        if (pendingEventUser) {
          const isDuplicate = normalizeComparableText(pendingEventUser.content) === normalizeComparableText(content);
          if (!isDuplicate) {
            chunks.push({
              type: 'user',
              content: pendingEventUser.content,
              timestamp: pendingEventUser.timestamp,
            });
          }
        }

        pendingEventUser = {
          content,
          timestamp: entry.timestamp,
        };
        continue;
      }

      const isUser = this.classifier.isUserMessage(entry);

      if (isUser) {
        flushAIChunk();
        const content = toUserContent(entry).trim();
        if (!content) {
          pendingEventUser = null;
          continue;
        }

        if (pendingEventUser) {
          const isDuplicate = normalizeComparableText(pendingEventUser.content) === normalizeComparableText(content);
          if (!isDuplicate) {
            chunks.push({
              type: 'user',
              content: pendingEventUser.content,
              timestamp: pendingEventUser.timestamp,
            });
          }
          pendingEventUser = null;
        }

        chunks.push({
          type: 'user',
          content,
          timestamp: entry.timestamp,
        });
        continue;
      }

      flushPendingEventUser();

      if (isResponseItemEntry(entry) && isMessagePayload(entry.payload) && entry.payload.role === 'developer') {
        flushAIChunk();
        chunks.push({
          type: 'system',
          content: entry.payload.content.map(getContentBlockText).filter(Boolean).join('\n'),
          timestamp: entry.timestamp,
        });
        continue;
      }

      const ai = ensureAIChunk(entry.timestamp);
      ai.endTimeMs = Math.max(ai.endTimeMs, timestampMs);

      if (isResponseItemEntry(entry) && isMessagePayload(entry.payload) && entry.payload.role === 'assistant') {
        for (const content of entry.payload.content) {
          const text = getContentBlockText(content);
          if (text) {
            pushUniqueAdjacent(ai.responseTextBlocks, text);
          }
        }
        continue;
      }

      if (isResponseItemEntry(entry) && isFunctionCallPayload(entry.payload)) {
        const toolExecution: CodexToolExecution = {
          functionCall: {
            name: entry.payload.name,
            arguments: entry.payload.arguments,
            callId: entry.payload.call_id,
          },
          functionOutput: null,
          duration: 0,
        };
        ai.callIndexById.set(entry.payload.call_id, {
          index: ai.toolExecutions.length,
          startTimeMs: timestampMs,
        });
        ai.toolExecutions.push(toolExecution);
        continue;
      }

      if (isResponseItemEntry(entry) && isFunctionCallOutputPayload(entry.payload)) {
        const existing = ai.callIndexById.get(entry.payload.call_id);
        if (existing) {
          const tool = ai.toolExecutions[existing.index];
          tool.functionOutput = {
            callId: entry.payload.call_id,
            output: entry.payload.output,
            isError: parseToolOutputError(entry.payload.output),
          };
          tool.duration = Math.max(timestampMs - existing.startTimeMs, 0);
        } else {
          ai.toolExecutions.push({
            functionCall: {
              name: 'unknown',
              arguments: '',
              callId: entry.payload.call_id,
            },
            functionOutput: {
              callId: entry.payload.call_id,
              output: entry.payload.output,
              isError: parseToolOutputError(entry.payload.output),
            },
            duration: 0,
          });
        }
        continue;
      }

      if (isResponseItemEntry(entry) && isReasoningPayload(entry.payload)) {
        for (const text of reasoningSummaryToText(entry.payload.summary)) {
          pushUniqueAdjacent(ai.responseReasoning, text);
        }
        continue;
      }

      if (isEventMsgEntry(entry) && isAgentMessagePayload(entry.payload)) {
        pushUniqueAdjacent(ai.eventTextBlocks, entry.payload.message);
        continue;
      }

      if (isEventMsgEntry(entry) && isAgentReasoningPayload(entry.payload)) {
        pushUniqueAdjacent(ai.eventReasoning, entry.payload.text);
        continue;
      }

      if (isEventMsgEntry(entry) && isTokenCountPayload(entry.payload)) {
        this.accumulateMetricsFromTokenEvent(ai.metrics, entry);
      }
    }

    flushPendingEventUser();
    flushAIChunk();
    return chunks;
  }

  private accumulateMetricsFromTokenEvent(
    target: Partial<CodexSessionMetrics>,
    entry: EventMsgEntry,
  ): void {
    if (!isTokenCountPayload(entry.payload) || !entry.payload.info) {
      return;
    }

    const usage = entry.payload.info.last_token_usage;
    target.inputTokens = (target.inputTokens ?? 0) + usage.input_tokens;
    target.cachedTokens = (target.cachedTokens ?? 0) + usage.cached_input_tokens;
    target.outputTokens = (target.outputTokens ?? 0) + usage.output_tokens;
    target.reasoningTokens = (target.reasoningTokens ?? 0) + usage.reasoning_output_tokens;
    target.totalTokens = (target.totalTokens ?? 0) + usage.total_tokens;
  }
}
