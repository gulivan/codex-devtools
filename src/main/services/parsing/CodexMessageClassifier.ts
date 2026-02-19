import {
  type CodexLogEntry,
  type EventMsgEntry,
  isAgentMessagePayload,
  isAgentReasoningPayload,
  isEventMsgEntry,
  isFunctionCallOutputPayload,
  isFunctionCallPayload,
  isMessagePayload,
  isReasoningPayload,
  isResponseItemEntry,
  isUserMessagePayload,
} from '@main/types';

export type CodexMessageKind =
  | 'user'
  | 'assistant'
  | 'developer'
  | 'function_call'
  | 'function_output'
  | 'reasoning'
  | 'event'
  | 'other';

export interface CodexClassifiedEntry {
  entry: CodexLogEntry;
  kind: CodexMessageKind;
}

export class CodexMessageClassifier {
  classifyEntry(entry: CodexLogEntry): CodexClassifiedEntry {
    if (this.isUserMessage(entry)) {
      return { entry, kind: 'user' };
    }

    if (this.isAssistantMessage(entry)) {
      return { entry, kind: 'assistant' };
    }

    if (this.isFunctionCall(entry)) {
      return { entry, kind: 'function_call' };
    }

    if (this.isFunctionOutput(entry)) {
      return { entry, kind: 'function_output' };
    }

    if (this.isReasoning(entry)) {
      return { entry, kind: 'reasoning' };
    }

    if (isResponseItemEntry(entry) && isMessagePayload(entry.payload) && entry.payload.role === 'developer') {
      return { entry, kind: 'developer' };
    }

    if (isEventMsgEntry(entry)) {
      return { entry, kind: 'event' };
    }

    return { entry, kind: 'other' };
  }

  classifyEntries(entries: CodexLogEntry[]): CodexClassifiedEntry[] {
    return entries.map((entry) => this.classifyEntry(entry));
  }

  isUserMessage(entry: CodexLogEntry): boolean {
    if (isResponseItemEntry(entry) && isMessagePayload(entry.payload)) {
      return entry.payload.role === 'user';
    }

    return isEventMsgEntry(entry) && isUserMessagePayload(entry.payload);
  }

  isAssistantMessage(entry: CodexLogEntry): boolean {
    if (isResponseItemEntry(entry) && isMessagePayload(entry.payload)) {
      return entry.payload.role === 'assistant';
    }

    if (!isEventMsgEntry(entry)) {
      return false;
    }

    return isAgentMessagePayload(entry.payload) || isAgentReasoningPayload(entry.payload);
  }

  isFunctionCall(entry: CodexLogEntry): boolean {
    return isResponseItemEntry(entry) && isFunctionCallPayload(entry.payload);
  }

  isFunctionOutput(entry: CodexLogEntry): boolean {
    return isResponseItemEntry(entry) && isFunctionCallOutputPayload(entry.payload);
  }

  isReasoning(entry: CodexLogEntry): boolean {
    if (isResponseItemEntry(entry) && isReasoningPayload(entry.payload)) {
      return true;
    }

    return isEventMsgEntry(entry) && isAgentReasoningPayload(entry.payload);
  }

  isTokenCountEvent(entry: CodexLogEntry): entry is EventMsgEntry {
    return isEventMsgEntry(entry) && entry.payload.type === 'token_count';
  }
}
