import { useEffect, useMemo, useRef } from 'react';

import { useAppStore } from '@renderer/store';
import { useVirtualizer } from '@tanstack/react-virtual';

import { AIChatGroup } from './AIChatGroup';
import { UserChatGroup } from './UserChatGroup';

interface ChatHistoryProps {
  sessionId?: string;
}

export const ChatHistory = ({ sessionId }: ChatHistoryProps): JSX.Element => {
  const { chunks, chunksLoading, chunksSessionId } = useAppStore((state) => ({
    chunks: state.chunks,
    chunksLoading: state.chunksLoading,
    chunksSessionId: state.chunksSessionId,
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

  const hasChunks = chunks.length > 0;
  const isLoading = chunksLoading && chunksSessionId === sessionId;

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
                <div className="chat-system-message">
                  <p>{chunk.content}</p>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }, [chunks, hasChunks, isLoading, rowVirtualizer, virtualRows]);

  return (
    <div className="chat-shell" ref={parentRef}>
      {content}
    </div>
  );
};
