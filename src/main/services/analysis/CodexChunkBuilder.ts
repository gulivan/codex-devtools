import { Buffer } from 'node:buffer';

import {
  type AIChunk,
  type AIChunkSection,
  type CodexChunk,
  type CodexLogEntry,
  type CodexSessionMetrics,
  type CodexToolExecution,
  type UserChunk,
  type UserAttachment,
  type UserAttachmentKind,
  type UserAttachmentPreviewReason,
  type EventMsgEntry,
  getContentBlockText,
  isAgentMessagePayload,
  isAgentReasoningPayload,
  isCompactionEntry,
  isCompactedEntry,
  isContextCompactedPayload,
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
import { classifyCodexBootstrapMessage } from '@shared/utils';

import { CodexMessageClassifier } from '../parsing/CodexMessageClassifier';

type SectionSource = 'response' | 'event';

interface InProgressMessageSection {
  kind: 'message';
  source: SectionSource;
  textBlocks: string[];
}

interface InProgressReasoningSection {
  kind: 'reasoning';
  source: SectionSource;
  summaries: string[];
}

interface InProgressToolsSection {
  kind: 'tools';
  toolIndexes: number[];
}

type InProgressAISection =
  | InProgressMessageSection
  | InProgressReasoningSection
  | InProgressToolsSection;

interface InProgressAIChunk {
  startTimeMs: number;
  endTimeMs: number;
  timestamp: string;
  responseTextBlocks: string[];
  eventTextBlocks: string[];
  toolExecutions: CodexToolExecution[];
  responseReasoning: string[];
  eventReasoning: string[];
  sections: InProgressAISection[];
  metrics: Partial<CodexSessionMetrics>;
  callIndexById: Map<string, { index: number; startTimeMs: number }>;
  pendingUsageToolIndex: number | null;
}

interface PendingUserEvent {
  content: string;
  timestamp: string;
  source: 'response' | 'event';
  attachments: UserAttachment[];
}

interface ModelUsageState {
  model: string;
  reasoningEffort: string;
}

const IMAGE_TAG_PATTERN = /<\/?image\b[^>]*>/gi;
const IMAGE_PLACEHOLDER_PATTERN = /\[(?:Image|Attachment) #\d+\]/gi;
const MAX_ATTACHMENT_PREVIEW_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_ATTACHMENT_PREVIEW_CHARS = 20_000;

const MARKDOWN_MIME_TYPES = new Set([
  'text/markdown',
  'text/x-markdown',
  'application/markdown',
]);

const CODE_MIME_TYPES = new Set([
  'application/json',
  'application/xml',
  'application/javascript',
  'application/x-javascript',
  'application/typescript',
  'application/x-typescript',
  'application/x-sh',
  'application/x-shellscript',
  'application/x-python',
  'application/x-rust',
  'application/x-go',
  'application/x-yaml',
  'application/yaml',
  'application/x-toml',
]);

const CODE_TEXT_SUBTYPES = new Set([
  'x-python',
  'x-sh',
  'x-shellscript',
  'x-go',
  'x-rust',
  'x-java',
  'x-c',
  'x-c++',
  'x-csharp',
  'javascript',
  'typescript',
  'html',
  'css',
  'xml',
  'yaml',
  'x-yaml',
  'toml',
  'csv',
]);

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

function normalizeBase64Payload(value: string): string {
  const compact = value.replace(/\s+/g, '');
  const remainder = compact.length % 4;
  if (remainder === 0) {
    return compact;
  }

  return `${compact}${'='.repeat(4 - remainder)}`;
}

function estimateBase64DecodedBytes(value: string): number {
  const normalized = normalizeBase64Payload(value);
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

interface ParsedBase64DataUrl {
  mimeType: string;
  base64Payload: string;
  dataUrl: string;
}

function parseBase64DataUrl(value: string): ParsedBase64DataUrl | null {
  const trimmed = value.trim();
  if (!trimmed.toLowerCase().startsWith('data:')) {
    return null;
  }

  const commaIndex = trimmed.indexOf(',');
  if (commaIndex < 0) {
    return null;
  }

  const metadata = trimmed.slice(5, commaIndex);
  const payload = trimmed.slice(commaIndex + 1);
  if (!/;base64$/i.test(metadata) && !/;base64;/i.test(metadata)) {
    return null;
  }

  const base64Payload = normalizeBase64Payload(payload);
  if (!base64Payload || /[^a-zA-Z0-9+/=]/.test(base64Payload)) {
    return null;
  }

  const mimeType = metadata.split(';')[0]?.trim().toLowerCase() || 'application/octet-stream';
  return {
    mimeType,
    base64Payload,
    dataUrl: `data:${metadata},${base64Payload}`,
  };
}

function inferAttachmentKind(mimeType: string): UserAttachmentKind {
  if (mimeType.startsWith('image/')) {
    return 'image';
  }

  if (MARKDOWN_MIME_TYPES.has(mimeType)) {
    return 'markdown';
  }

  if (CODE_MIME_TYPES.has(mimeType)) {
    return 'code';
  }

  if (mimeType.startsWith('text/')) {
    const subtype = mimeType.slice('text/'.length);
    if (subtype === 'markdown' || subtype === 'x-markdown') {
      return 'markdown';
    }

    return CODE_TEXT_SUBTYPES.has(subtype) ? 'code' : 'text';
  }

  if (mimeType === 'application/octet-stream') {
    return 'binary';
  }

  if (mimeType.startsWith('application/')) {
    return 'binary';
  }

  return 'unknown';
}

function truncateTextPreview(value: string): string {
  if (value.length <= MAX_TEXT_ATTACHMENT_PREVIEW_CHARS) {
    return value;
  }

  return `${value.slice(0, MAX_TEXT_ATTACHMENT_PREVIEW_CHARS)}\n\n… preview truncated`;
}

function decodeBase64Text(value: string): string | null {
  try {
    const decoded = Buffer.from(normalizeBase64Payload(value), 'base64').toString('utf8');
    return truncateTextPreview(decoded);
  } catch {
    return null;
  }
}

function attachmentFingerprint(attachment: UserAttachment): string {
  const previewSample = attachment.dataUrl
    ? attachment.dataUrl.slice(0, 96)
    : attachment.textContent
      ? attachment.textContent.slice(0, 96)
      : '';

  return [
    attachment.mimeType,
    attachment.kind,
    attachment.sizeBytes ?? -1,
    attachment.previewable ? '1' : '0',
    attachment.previewReason ?? '',
    previewSample,
  ].join('|');
}

function mergeAttachments(primary: UserAttachment[], incoming: UserAttachment[]): UserAttachment[] {
  if (primary.length === 0) {
    return [...incoming];
  }

  if (incoming.length === 0) {
    return [...primary];
  }

  const merged = [...primary];
  const seen = new Set(primary.map((attachment) => attachmentFingerprint(attachment)));
  for (const attachment of incoming) {
    const fingerprint = attachmentFingerprint(attachment);
    if (seen.has(fingerprint)) {
      continue;
    }

    seen.add(fingerprint);
    merged.push(attachment);
  }

  return merged;
}

function withPreviewDisabledReason(
  attachment: UserAttachment,
  previewReason: UserAttachmentPreviewReason,
): UserAttachment {
  return {
    ...attachment,
    previewable: false,
    previewReason,
    dataUrl: undefined,
    textContent: undefined,
  };
}

function buildAttachmentFromDataUrl(
  dataUrl: string,
  attachmentId: string,
  source: 'response_item' | 'event_msg',
): UserAttachment {
  const parsed = parseBase64DataUrl(dataUrl);
  if (!parsed) {
    return {
      id: attachmentId,
      source,
      mimeType: 'application/octet-stream',
      kind: 'unknown',
      encoding: 'base64',
      sizeBytes: null,
      previewable: false,
      previewReason: 'decode_error',
      fileName: null,
    };
  }

  const kind = inferAttachmentKind(parsed.mimeType);
  const sizeBytes = estimateBase64DecodedBytes(parsed.base64Payload);

  const baseAttachment: UserAttachment = {
    id: attachmentId,
    source,
    mimeType: parsed.mimeType,
    kind,
    encoding: 'base64',
    sizeBytes,
    previewable: false,
    fileName: null,
  };

  if (sizeBytes > MAX_ATTACHMENT_PREVIEW_BYTES) {
    return withPreviewDisabledReason(baseAttachment, 'too_large');
  }

  if (kind === 'image') {
    return {
      ...baseAttachment,
      previewable: true,
      dataUrl: parsed.dataUrl,
    };
  }

  if (kind === 'text' || kind === 'markdown' || kind === 'code') {
    const textContent = decodeBase64Text(parsed.base64Payload);
    if (textContent === null) {
      return withPreviewDisabledReason(baseAttachment, 'decode_error');
    }

    return {
      ...baseAttachment,
      previewable: true,
      textContent,
    };
  }

  if (kind === 'binary') {
    return withPreviewDisabledReason(baseAttachment, 'binary');
  }

  return withPreviewDisabledReason(baseAttachment, 'unsupported_mime');
}

function extractAttachmentsFromResponseUser(
  entry: CodexLogEntry,
  timestamp: string,
): UserAttachment[] {
  if (!isResponseItemEntry(entry) || !isMessagePayload(entry.payload) || entry.payload.role !== 'user') {
    return [];
  }

  const attachments: UserAttachment[] = [];
  let attachmentIndex = 0;

  for (const block of entry.payload.content) {
    if (block.type !== 'input_image') {
      continue;
    }

    if (!('image_url' in block) || typeof block.image_url !== 'string') {
      continue;
    }

    attachmentIndex += 1;
    attachments.push(
      buildAttachmentFromDataUrl(
        block.image_url,
        `${timestamp}-attachment-${attachmentIndex}`,
        'response_item',
      ),
    );
  }

  return attachments;
}

function attachmentPlaceholder(attachment: UserAttachment, index: number): string {
  if (attachment.kind === 'image') {
    return `[Image #${index + 1}]`;
  }

  return `[Attachment #${index + 1}]`;
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

function normalizeReasoningEffort(effort: string | undefined): string {
  const value = effort?.trim();
  return value ? value : 'unknown';
}

function normalizeCollaborationMode(
  value: string | Record<string, unknown> | undefined,
): string {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  const mode = value.mode;
  if (typeof mode === 'string') {
    return mode.trim();
  }

  return '';
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

function addMessageSection(
  ai: InProgressAIChunk,
  source: SectionSource,
  blocks: string[],
): void {
  const textBlocks: string[] = [];
  for (const block of blocks) {
    pushUniqueAdjacent(textBlocks, block);
  }

  if (textBlocks.length === 0) {
    return;
  }

  ai.sections.push({
    kind: 'message',
    source,
    textBlocks,
  });
}

function addReasoningSection(
  ai: InProgressAIChunk,
  source: SectionSource,
  summaries: string[],
): void {
  const nextSummaries: string[] = [];
  for (const summary of summaries) {
    pushUniqueAdjacent(nextSummaries, summary);
  }

  if (nextSummaries.length === 0) {
    return;
  }

  const last = ai.sections[ai.sections.length - 1];
  if (last?.kind === 'reasoning' && last.source === source) {
    for (const summary of nextSummaries) {
      pushUniqueAdjacent(last.summaries, summary);
    }
    return;
  }

  ai.sections.push({
    kind: 'reasoning',
    source,
    summaries: nextSummaries,
  });
}

function addToolSectionIndex(ai: InProgressAIChunk, toolIndex: number): void {
  for (const section of ai.sections) {
    if (section.kind === 'tools' && section.toolIndexes.includes(toolIndex)) {
      return;
    }
  }

  const last = ai.sections[ai.sections.length - 1];
  if (last?.kind === 'tools') {
    if (!last.toolIndexes.includes(toolIndex)) {
      last.toolIndexes.push(toolIndex);
    }
    return;
  }

  ai.sections.push({
    kind: 'tools',
    toolIndexes: [toolIndex],
  });
}

function shouldInsertCompactionChunk(chunks: CodexChunk[], timestamp: string): boolean {
  const last = chunks[chunks.length - 1];
  if (!last || last.type !== 'compaction') {
    return true;
  }

  const deltaMs = Math.abs(parseTimestampMs(timestamp) - parseTimestampMs(last.timestamp));
  return deltaMs > 1_000;
}

function buildOrderedAISections(ai: InProgressAIChunk): AIChunkSection[] {
  const hasResponseMessages = ai.sections.some(
    (section) => section.kind === 'message' && section.source === 'response',
  );
  const hasResponseReasoning = ai.sections.some(
    (section) => section.kind === 'reasoning' && section.source === 'response',
  );

  const selected = ai.sections.filter((section) => {
    if (section.kind === 'message') {
      return section.source === (hasResponseMessages ? 'response' : 'event');
    }

    if (section.kind === 'reasoning') {
      return section.source === (hasResponseReasoning ? 'response' : 'event');
    }

    return true;
  });

  const merged: AIChunkSection[] = [];
  for (const section of selected) {
    if (section.kind === 'message') {
      const textBlocks: string[] = [];
      for (const block of section.textBlocks) {
        pushUniqueAdjacent(textBlocks, block);
      }

      if (textBlocks.length > 0) {
        merged.push({
          type: 'message',
          textBlocks,
        });
      }
      continue;
    }

    if (section.kind === 'reasoning') {
      const last = merged[merged.length - 1];
      if (last?.type === 'reasoning') {
        for (const summary of section.summaries) {
          pushUniqueAdjacent(last.summaries, summary);
        }
      } else {
        const summaries: string[] = [];
        for (const summary of section.summaries) {
          pushUniqueAdjacent(summaries, summary);
        }

        if (summaries.length > 0) {
          merged.push({
            type: 'reasoning',
            summaries,
          });
        }
      }
      continue;
    }

    const executions = section.toolIndexes
      .map((index) => ai.toolExecutions[index])
      .filter((execution): execution is CodexToolExecution => Boolean(execution));
    if (executions.length === 0) {
      continue;
    }

    const last = merged[merged.length - 1];
    if (last?.type === 'tool_executions') {
      const seenCallIds = new Set(last.executions.map((execution) => execution.functionCall.callId));
      for (const execution of executions) {
        if (seenCallIds.has(execution.functionCall.callId)) {
          continue;
        }

        seenCallIds.add(execution.functionCall.callId);
        last.executions.push(execution);
      }
    } else {
      merged.push({
        type: 'tool_executions',
        executions: [...executions],
      });
    }
  }

  return merged;
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
    const preferred = pickPreferredEquivalentUserContent(pending, incoming);
    return {
      ...preferred,
      attachments: mergeAttachments(pending.attachments, incoming.attachments),
    };
  }

  pushPendingUserChunk(chunks, pending);
  return incoming;
}

function pushPendingUserChunk(chunks: CodexChunk[], pending: PendingUserEvent): void {
  if (classifyCodexBootstrapMessage(pending.content)) {
    chunks.push({
      type: 'system',
      content: pending.content,
      timestamp: pending.timestamp,
    });
    return;
  }

  const userChunk: UserChunk = {
    type: 'user',
    content: pending.content,
    timestamp: pending.timestamp,
  };
  if (pending.attachments.length > 0) {
    userChunk.attachments = pending.attachments;
  }

  chunks.push(userChunk);
}

interface UserEntryPayload {
  content: string;
  attachments: UserAttachment[];
}

function toUserPayload(entry: CodexLogEntry): UserEntryPayload {
  if (isResponseItemEntry(entry) && isMessagePayload(entry.payload) && entry.payload.role === 'user') {
    const attachments = extractAttachmentsFromResponseUser(entry, entry.timestamp);
    let content = sanitizeUserText(entry.payload.content.map(getContentBlockText).filter(Boolean).join('\n'));
    if (!content && attachments.length > 0) {
      content = attachments.map((attachment, index) => attachmentPlaceholder(attachment, index)).join('\n');
    }

    return {
      content,
      attachments,
    };
  }

  if (isEventMsgEntry(entry) && isUserMessagePayload(entry.payload)) {
    return {
      content: sanitizeUserText(entry.payload.message),
      attachments: [],
    };
  }

  return {
    content: '',
    attachments: [],
  };
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
    let lastSeenModelUsage: ModelUsageState | null = null;
    let lastSeenCollaborationMode = '';

    const flushAIChunk = (): void => {
      if (!currentAI) {
        return;
      }

      const sections = buildOrderedAISections(currentAI);
      const textBlocks: string[] = [];
      const reasoning: string[] = [];
      for (const section of sections) {
        if (section.type === 'message') {
          for (const block of section.textBlocks) {
            pushUniqueAdjacent(textBlocks, block);
          }
        } else if (section.type === 'reasoning') {
          for (const summary of section.summaries) {
            pushUniqueAdjacent(reasoning, summary);
          }
        }
      }

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
        sections,
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
        sections: [],
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

      pushPendingUserChunk(chunks, pendingUser);
      pendingUser = null;
    };

    for (const entry of sortedEntries) {
      const timestampMs = parseTimestampMs(entry.timestamp);

      if (isCompactedEntry(entry) || isCompactionEntry(entry)) {
        flushPendingEventUser();
        flushAIChunk();
        if (shouldInsertCompactionChunk(chunks, entry.timestamp)) {
          chunks.push({
            type: 'compaction',
            timestamp: entry.timestamp,
          });
        }
        continue;
      }

      if (isTurnContextEntry(entry)) {
        const model = normalizeModel(entry.payload.model);
        if (model) {
          const usage: ModelUsageState = {
            model,
            reasoningEffort: normalizeReasoningEffort(entry.payload.effort),
          };

          if (lastSeenModelUsage === null) {
            lastSeenModelUsage = usage;
          } else if (
            lastSeenModelUsage.model !== usage.model ||
            lastSeenModelUsage.reasoningEffort !== usage.reasoningEffort
          ) {
            flushPendingEventUser();
            flushAIChunk();
            chunks.push({
              type: 'model_change',
              previousModel: lastSeenModelUsage.model,
              previousReasoningEffort: lastSeenModelUsage.reasoningEffort,
              model: usage.model,
              reasoningEffort: usage.reasoningEffort,
              timestamp: entry.timestamp,
            });
            lastSeenModelUsage = usage;
          }
        }

        const collaborationMode = normalizeCollaborationMode(entry.payload.collaboration_mode);
        if (collaborationMode) {
          if (!lastSeenCollaborationMode) {
            lastSeenCollaborationMode = collaborationMode;
          } else if (lastSeenCollaborationMode !== collaborationMode) {
            flushPendingEventUser();
            flushAIChunk();
            chunks.push({
              type: 'collaboration_mode_change',
              previousMode: lastSeenCollaborationMode,
              mode: collaborationMode,
              timestamp: entry.timestamp,
            });
            lastSeenCollaborationMode = collaborationMode;
          }
        }

        continue;
      }

      if (isEventMsgEntry(entry) && isContextCompactedPayload(entry.payload)) {
        flushPendingEventUser();
        flushAIChunk();
        if (shouldInsertCompactionChunk(chunks, entry.timestamp)) {
          chunks.push({
            type: 'compaction',
            timestamp: entry.timestamp,
          });
        }
        continue;
      }

      if (isEventMsgEntry(entry) && isUserMessagePayload(entry.payload)) {
        flushAIChunk();
        const payload = toUserPayload(entry);
        const content = payload.content.trim();
        if (!content) {
          continue;
        }

        pendingUser = mergePendingUser(chunks, pendingUser, {
          content,
          timestamp: entry.timestamp,
          source: 'event',
          attachments: payload.attachments,
        });
        continue;
      }

      const isUser = this.classifier.isUserMessage(entry);

      if (isUser) {
        flushAIChunk();
        const payload = toUserPayload(entry);
        const content = payload.content.trim();
        if (!content) {
          continue;
        }

        pendingUser = mergePendingUser(chunks, pendingUser, {
          content,
          timestamp: entry.timestamp,
          source: 'response',
          attachments: payload.attachments,
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
        const entryTextBlocks: string[] = [];
        for (const content of entry.payload.content) {
          const text = getContentBlockText(content);
          if (text) {
            pushUniqueAdjacent(ai.responseTextBlocks, text);
            pushUniqueAdjacent(entryTextBlocks, text);
          }
        }
        addMessageSection(ai, 'response', entryTextBlocks);
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
        addToolSectionIndex(ai, ai.toolExecutions.length - 1);
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
          addToolSectionIndex(ai, existing.index);
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
          addToolSectionIndex(ai, ai.toolExecutions.length - 1);
        }
        continue;
      }

      if (isResponseItemEntry(entry) && isReasoningPayload(entry.payload)) {
        const entrySummaries = reasoningSummaryToText(entry.payload.summary);
        for (const text of entrySummaries) {
          pushUniqueAdjacent(ai.responseReasoning, text);
        }
        addReasoningSection(ai, 'response', entrySummaries);
        continue;
      }

      if (isEventMsgEntry(entry) && isAgentMessagePayload(entry.payload)) {
        pushUniqueAdjacent(ai.eventTextBlocks, entry.payload.message);
        addMessageSection(ai, 'event', [entry.payload.message]);
        continue;
      }

      if (isEventMsgEntry(entry) && isAgentReasoningPayload(entry.payload)) {
        pushUniqueAdjacent(ai.eventReasoning, entry.payload.text);
        addReasoningSection(ai, 'event', [entry.payload.text]);
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
