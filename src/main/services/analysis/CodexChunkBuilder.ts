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
  isTurnContextEntry,
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
  pendingUsageToolIndex: number | null;
}

interface PendingUserEvent {
  content: string;
  timestamp: string;
  source: 'response' | 'event';
}

const IMAGE_TAG_PATTERN = /<\/?image\b[^>]*>/gi;
const IMAGE_PLACEHOLDER_PATTERN = /\[Image #\d+\]/gi;

function parseTimestampMs(timestamp: string): number {
  const ms = new Date(timestamp).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function normalizeComparableText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function sanitizeUserText(value: string): string {
  return value
    .replace(IMAGE_TAG_PATTERN, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function countImagePlaceholders(value: string): number {
  const matches = sanitizeUserText(value).match(IMAGE_PLACEHOLDER_PATTERN);
  return matches?.length ?? 0;
}

function normalizeUserTextWithoutImagePlaceholders(value: string): string {
  return normalizeComparableText(
    sanitizeUserText(value).replace(IMAGE_PLACEHOLDER_PATTERN, ' '),
  );
}

function isEquivalentUserContent(left: string, right: string): boolean {
  const normalizedLeft = normalizeComparableText(sanitizeUserText(left));
  const normalizedRight = normalizeComparableText(sanitizeUserText(right));
  if (normalizedLeft === normalizedRight) {
    return true;
  }

  const textOnlyLeft = normalizeUserTextWithoutImagePlaceholders(left);
  const textOnlyRight = normalizeUserTextWithoutImagePlaceholders(right);
  if (textOnlyLeft && textOnlyLeft === textOnlyRight) {
    return true;
  }

  if (!textOnlyLeft && !textOnlyRight) {
    const placeholderCountLeft = countImagePlaceholders(left);
    const placeholderCountRight = countImagePlaceholders(right);
    return placeholderCountLeft > 0 && placeholderCountLeft === placeholderCountRight;
  }

  return false;
}

function pickPreferredEquivalentUserContent(
  pending: PendingUserEvent,
  incoming: PendingUserEvent,
): PendingUserEvent {
  const pendingPlaceholderCount = countImagePlaceholders(pending.content);
  const incomingPlaceholderCount = countImagePlaceholders(incoming.content);
  if (incomingPlaceholderCount !== pendingPlaceholderCount) {
    return incomingPlaceholderCount > pendingPlaceholderCount ? incoming : pending;
  }

  if (pending.source === 'event' && incoming.source === 'response') {
    return incoming;
  }

  return pending;
}

function normalizeModel(model: string | undefined): string {
  return model?.trim() ?? '';
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

function mergePendingUser(
  chunks: CodexChunk[],
  pending: PendingUserEvent | null,
  incoming: PendingUserEvent,
): PendingUserEvent {
  if (!pending) {
    return incoming;
  }

  const sameText = isEquivalentUserContent(pending.content, incoming.content);
  if (sameText) {
    return pickPreferredEquivalentUserContent(pending, incoming);
  }

  chunks.push({
    type: 'user',
    content: pending.content,
    timestamp: pending.timestamp,
  });
  return incoming;
}

function toUserContent(entry: CodexLogEntry): string {
  if (isResponseItemEntry(entry) && isMessagePayload(entry.payload) && entry.payload.role === 'user') {
    return sanitizeUserText(entry.payload.content.map(getContentBlockText).filter(Boolean).join('\n'));
  }

  if (isEventMsgEntry(entry) && isUserMessagePayload(entry.payload)) {
    return sanitizeUserText(entry.payload.message);
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
    let pendingUser: PendingUserEvent | null = null;
    let lastSeenModel: string | null = null;

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
        pendingUsageToolIndex: null,
      };
      return currentAI;
    };

    const flushPendingEventUser = (): void => {
      if (!pendingUser) {
        return;
      }

      chunks.push({
        type: 'user',
        content: pendingUser.content,
        timestamp: pendingUser.timestamp,
      });
      pendingUser = null;
    };

    for (const entry of sortedEntries) {
      const timestampMs = parseTimestampMs(entry.timestamp);

      if (isTurnContextEntry(entry)) {
        const model = normalizeModel(entry.payload.model);
        if (!model) {
          continue;
        }

        if (lastSeenModel === null) {
          lastSeenModel = model;
          continue;
        }

        if (lastSeenModel === model) {
          continue;
        }

        flushPendingEventUser();
        flushAIChunk();
        chunks.push({
          type: 'model_change',
          previousModel: lastSeenModel,
          model,
          timestamp: entry.timestamp,
        });
        lastSeenModel = model;
        continue;
      }

      if (isEventMsgEntry(entry) && isUserMessagePayload(entry.payload)) {
        flushAIChunk();
        const content = sanitizeUserText(entry.payload.message);
        if (!content) {
          continue;
        }

        pendingUser = mergePendingUser(chunks, pendingUser, {
          content,
          timestamp: entry.timestamp,
          source: 'event',
        });
        continue;
      }

      const isUser = this.classifier.isUserMessage(entry);

      if (isUser) {
        flushAIChunk();
        const content = toUserContent(entry).trim();
        if (!content) {
          continue;
        }

        pendingUser = mergePendingUser(chunks, pendingUser, {
          content,
          timestamp: entry.timestamp,
          source: 'response',
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
          tokenUsage: null,
        };
        ai.pendingUsageToolIndex = ai.toolExecutions.length;
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
            tokenUsage: null,
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
        this.assignTokenUsageToPendingTool(ai, entry);
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

  private assignTokenUsageToPendingTool(ai: InProgressAIChunk, entry: EventMsgEntry): void {
    if (!isTokenCountPayload(entry.payload) || !entry.payload.info) {
      return;
    }

    if (ai.pendingUsageToolIndex === null) {
      return;
    }

    const tool = ai.toolExecutions[ai.pendingUsageToolIndex];
    if (!tool) {
      ai.pendingUsageToolIndex = null;
      return;
    }

    const usage = entry.payload.info.last_token_usage;
    if (tool.tokenUsage) {
      tool.tokenUsage.inputTokens += usage.input_tokens;
      tool.tokenUsage.outputTokens += usage.output_tokens;
    } else {
      tool.tokenUsage = {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
      };
    }

    ai.pendingUsageToolIndex = null;
  }
}
