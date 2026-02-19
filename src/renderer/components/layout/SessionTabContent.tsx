import { useEffect } from 'react';

import { useAppStore } from '@renderer/store';

import { ChatHistory } from '../chat/ChatHistory';

import type { AppTab } from '@renderer/store';

interface SessionTabContentProps {
  tab: AppTab;
}

export const SessionTabContent = ({ tab }: SessionTabContentProps): JSX.Element => {
  const { selectSession, chunksLoading, chunksError, activeSessionId } = useAppStore((state) => ({
    selectSession: state.selectSession,
    chunksLoading: state.chunksLoading,
    chunksError: state.chunksError,
    activeSessionId: state.activeSessionId,
  }));

  useEffect(() => {
    if (tab.type === 'session' && tab.sessionId && tab.sessionId !== activeSessionId) {
      void selectSession(tab.sessionId);
    }
  }, [tab, activeSessionId, selectSession]);

  if (chunksError) {
    return (
      <div className="empty-view">
        <p className="empty-title">Failed to load session</p>
        <p className="empty-copy">{chunksError}</p>
      </div>
    );
  }

  if (chunksLoading && activeSessionId !== tab.sessionId) {
    return (
      <div className="empty-view">
        <p className="empty-title">Loading session...</p>
      </div>
    );
  }

  return <ChatHistory sessionId={tab.sessionId} />;
};
