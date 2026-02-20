import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAppStore } from '@renderer/store';
import {
  classifyCodexBootstrapMessage,
  type CodexBootstrapMessageKind,
} from '@shared/utils';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Layers } from 'lucide-react';

import { AIChatGroup } from './AIChatGroup';
import { CHAT_LAYOUT_INVALIDATED_EVENT, notifyChatLayoutInvalidated } from './chatLayoutEvents';
import { UserChatGroup } from './UserChatGroup';

interface ChatHistoryProps {
  sessionId?: string;
}

interface SessionTokenStats {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
}

function extractCollaborationModeLabel(content: string): string {
  const match = content.match(/#\s*Collaboration Mode:\s*([^\n]+)/i);
  if (!match?.[1]) {
    return 'unknown';
  }

  return match[1].trim();
}

function getPreludeLabel(kind: CodexBootstrapMessageKind): string {
  switch (kind) {
    case 'agents_instructions':
      return 'AGENTS.md instructions';
    case 'environment_context':
      return 'Environment context';
    case 'permissions_instructions':
      return 'Permissions instructions';
    case 'collaboration_mode':
      return 'Collaboration mode';
    case 'turn_aborted':
      return 'Turn aborted';
  }
}

function getPreludeHint(kind: CodexBootstrapMessageKind): string {
  switch (kind) {
    case 'turn_aborted':
      return 'System action';
    default:
      return 'System prelude';
  }
}

function buildSessionTokenStats(): SessionTokenStats {
  return {
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
  };
}

function buildSystemPreludeKey(timestamp: string, rowIndex: number): string {
  return `${timestamp}-${rowIndex}`;
}

export const ChatHistory = ({ sessionId }: ChatHistoryProps): JSX.Element => {
  const { chunks, chunksLoading, chunksSessionId, sessions } = useAppStore((state) => ({
    chunks: state.chunks,
    chunksLoading: state.chunksLoading,
    chunksSessionId: state.chunksSessionId,
    sessions: state.sessions,
  }));

  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: chunks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 168,
    overscan: 6,
  });
  const [expandedPreludeKeys, setExpandedPreludeKeys] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  const virtualRows = rowVirtualizer.getVirtualItems();

  const remeasureVisibleRows = useCallback((): void => {
    rowVirtualizer.measure();

    const parent = parentRef.current;
    if (!parent) {
      return;
    }

    for (const row of rowVirtualizer.getVirtualItems()) {
      const element = parent.querySelector<HTMLElement>(`[data-index="${row.index}"]`);
      if (!element) {
        continue;
      }

      rowVirtualizer.measureElement(element);
    }
  }, [rowVirtualizer]);

  const toggleSystemPrelude = useCallback((preludeKey: string): void => {
    setExpandedPreludeKeys((current) => {
      const next = new Set(current);
      if (next.has(preludeKey)) {
        next.delete(preludeKey);
      } else {
        next.add(preludeKey);
      }

      return next;
    });
    remeasureVisibleRows();
    notifyChatLayoutInvalidated();
  }, [remeasureVisibleRows]);

  useEffect(() => {
    setExpandedPreludeKeys(new Set<string>());
  }, [sessionId]);

  useEffect(() => {
    const container = parentRef.current;
    if (!container) {
      return;
    }

    const raf = requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });

    return () => cancelAnimationFrame(raf);
  }, [chunks.length, sessionId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleLayoutInvalidation = (): void => {
      remeasureVisibleRows();

      requestAnimationFrame(() => {
        remeasureVisibleRows();
      });
    };

    window.addEventListener(CHAT_LAYOUT_INVALIDATED_EVENT, handleLayoutInvalidation);
    return () => {
      window.removeEventListener(CHAT_LAYOUT_INVALIDATED_EVENT, handleLayoutInvalidation);
    };
  }, [remeasureVisibleRows]);

  useEffect(() => {
    remeasureVisibleRows();
    const raf = requestAnimationFrame(() => {
      remeasureVisibleRows();
    });

    return () => cancelAnimationFrame(raf);
  }, [chunks, expandedPreludeKeys, remeasureVisibleRows]);

  const hasChunks = chunks.length > 0;
  const isLoading = chunksLoading && chunksSessionId === sessionId;
  const sessionTokenStats = useMemo(() => {
    return chunks.reduce<SessionTokenStats>((totals, chunk) => {
      if (chunk.type !== 'ai') {
        return totals;
      }

      totals.totalTokens += chunk.metrics.totalTokens ?? 0;
      totals.inputTokens += chunk.metrics.inputTokens ?? 0;
      totals.outputTokens += chunk.metrics.outputTokens ?? 0;
      return totals;
    }, buildSessionTokenStats());
  }, [chunks]);
  const initialModelUsage = useMemo(() => {
    if (!sessionId) {
      return null;
    }

    const session = sessions.find((item) => item.id === sessionId);
    if (!session) {
      return null;
    }

    if (Array.isArray(session.modelUsages) && session.modelUsages.length > 0) {
      return session.modelUsages[0];
    }

    if (!session.model) {
      return null;
    }

    return { model: session.model, reasoningEffort: 'unknown' };
  }, [sessionId, sessions]);

  const content = useMemo(() => {
    if (isLoading && !hasChunks) {
      return (
        <div className="empty-view">
          <p className="empty-title">Loading conversation...</p>
        </div>
      );
    }

    if (!hasChunks) {
      return (
        <div className="empty-view">
          <p className="empty-title">No messages in this session</p>
          <p className="empty-copy">Select another session from the sidebar.</p>
        </div>
      );
    }

    return (
      <>
        <div className="chat-session-token-sticky">
          <div className="chat-session-token-strip" aria-label="Session token totals and initial model">
            {initialModelUsage ? (
              <span className="chat-session-token-pair">
                <span className="chat-session-token-key">Model:</span>
                <span className="chat-session-token-value">
                  {initialModelUsage.model}
                  {initialModelUsage.reasoningEffort !== 'unknown'
                    ? ` (${initialModelUsage.reasoningEffort})`
                    : ''}
                </span>
              </span>
            ) : null}
            <span className="chat-session-token-pair">
              <span className="chat-session-token-key">In:</span>
              <span className="chat-session-token-value">{sessionTokenStats.inputTokens.toLocaleString()}</span>
            </span>
            <span className="chat-session-token-pair">
              <span className="chat-session-token-key">Out:</span>
              <span className="chat-session-token-value">{sessionTokenStats.outputTokens.toLocaleString()}</span>
            </span>
            <span className="chat-session-token-pair">
              <span className="chat-session-token-key">Total:</span>
              <span className="chat-session-token-value">{sessionTokenStats.totalTokens.toLocaleString()}</span>
            </span>
          </div>
        </div>
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualRows.map((virtualRow) => {
            const chunk = chunks[virtualRow.index];
            if (!chunk) {
              return null;
            }

            const systemPreludeKind =
              chunk.type === 'system' ? classifyCodexBootstrapMessage(chunk.content) : null;
            const systemPreludeKey =
              chunk.type === 'system' &&
              systemPreludeKind &&
              systemPreludeKind !== 'collaboration_mode'
                ? buildSystemPreludeKey(chunk.timestamp, virtualRow.index)
                : null;
            const isSystemPreludeExpanded =
              systemPreludeKey !== null && expandedPreludeKeys.has(systemPreludeKey);

            const key = `${chunk.type}-${chunk.timestamp}-${virtualRow.index}`;

            return (
              <div
                key={key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                className="chat-row"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {chunk.type === 'user' ? <UserChatGroup chunk={chunk} /> : null}
                {chunk.type === 'ai' ? <AIChatGroup chunk={chunk} /> : null}
                {chunk.type === 'system' ? (
                  systemPreludeKind ? (
                    systemPreludeKind === 'collaboration_mode' ? (
                      <div className="chat-model-change">
                        <span className="chat-model-change-label">
                          Collaboration mode: <code>{extractCollaborationModeLabel(chunk.content)}</code>
                        </span>
                      </div>
                    ) : (
                      <section
                        className={`chat-system-prelude ${systemPreludeKind}${
                          isSystemPreludeExpanded ? ' open' : ''
                        }`}
                      >
                        <button
                          type="button"
                          className="chat-system-prelude-summary"
                          aria-expanded={isSystemPreludeExpanded}
                          onClick={() => {
                            if (systemPreludeKey) {
                              toggleSystemPrelude(systemPreludeKey);
                            }
                          }}
                        >
                          <span>{getPreludeLabel(systemPreludeKind)}</span>
                          <span className="chat-system-prelude-summary-hint">
                            {getPreludeHint(systemPreludeKind)}
                          </span>
                        </button>
                        {isSystemPreludeExpanded ? (
                          <pre className="chat-system-prelude-content">{chunk.content}</pre>
                        ) : null}
                      </section>
                    )
                  ) : (
                    <div className="chat-system-message">
                      <p>{chunk.content}</p>
                    </div>
                  )
                ) : null}
                {chunk.type === 'model_change' ? (
                  <div className="chat-model-change">
                    <span className="chat-model-change-label">
                      Model changed: <code>{chunk.previousModel}</code>{' '}
                      <code>{chunk.previousReasoningEffort}</code> -&gt;{' '}
                      <code>{chunk.model}</code> <code>{chunk.reasoningEffort}</code>
                    </span>
                  </div>
                ) : null}
                {chunk.type === 'collaboration_mode_change' ? (
                  <div className="chat-model-change">
                    <span className="chat-model-change-label">
                      Collaboration mode: <code>{chunk.previousMode}</code> -&gt; <code>{chunk.mode}</code>
                    </span>
                  </div>
                ) : null}
                {chunk.type === 'compaction' ? (
                  <div className="chat-compaction-divider">
                    <span className="chat-compaction-divider-label">
                      <Layers size={14} aria-hidden="true" />
                      Context compacted
                    </span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </>
    );
  }, [
    chunks,
    hasChunks,
    initialModelUsage,
    isLoading,
    rowVirtualizer,
    sessionTokenStats.inputTokens,
    sessionTokenStats.outputTokens,
    sessionTokenStats.totalTokens,
    expandedPreludeKeys,
    remeasureVisibleRows,
    toggleSystemPrelude,
    virtualRows,
  ]);

  return (
    <div className="chat-shell" ref={parentRef}>
      {content}
    </div>
  );
};
