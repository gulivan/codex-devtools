import { useEffect, useMemo, useRef } from 'react';

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

  const virtualRows = rowVirtualizer.getVirtualItems();

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
      rowVirtualizer.measure();
    };

    window.addEventListener(CHAT_LAYOUT_INVALIDATED_EVENT, handleLayoutInvalidation);
    return () => {
      window.removeEventListener(CHAT_LAYOUT_INVALIDATED_EVENT, handleLayoutInvalidation);
    };
  }, [rowVirtualizer]);

  const hasChunks = chunks.length > 0;
  const isLoading = chunksLoading && chunksSessionId === sessionId;
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
        {initialModelUsage ? (
          <div className="chat-model-summary">
            <span className="chat-model-summary-label">
              Initial model: <code>{initialModelUsage.model}</code>
              {initialModelUsage.reasoningEffort !== 'unknown' ? (
                <>
                  {' '}
                  <code>{initialModelUsage.reasoningEffort}</code>
                </>
              ) : null}
            </span>
          </div>
        ) : null}
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
                      <details
                        className={`chat-system-prelude ${systemPreludeKind}`}
                        onToggle={notifyChatLayoutInvalidated}
                      >
                        <summary className="chat-system-prelude-summary">
                          <span>{getPreludeLabel(systemPreludeKind)}</span>
                          <span className="chat-system-prelude-summary-hint">
                            {getPreludeHint(systemPreludeKind)}
                          </span>
                        </summary>
                        <pre className="chat-system-prelude-content">{chunk.content}</pre>
                      </details>
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
                      <Layers size={12} aria-hidden="true" />
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
  }, [chunks, hasChunks, initialModelUsage, isLoading, rowVirtualizer, virtualRows]);

  return (
    <div className="chat-shell" ref={parentRef}>
      {content}
    </div>
  );
};
