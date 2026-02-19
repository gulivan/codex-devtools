import { format } from 'date-fns';

import type { CodexSession } from '@main/types';

interface SessionItemProps {
  session: CodexSession;
  isActive: boolean;
  preview: string;
  onSelect: () => void;
}

export const SessionItem = ({ session, isActive, preview, onSelect }: SessionItemProps): JSX.Element => {
  return (
    <button type="button" onClick={onSelect} className={`session-item ${isActive ? 'active' : ''}`}>
      <div className="session-item-header">
        <span className="session-model-badge">{session.model || 'unknown-model'}</span>
        <time className="session-time">{format(new Date(session.startTime), 'p')}</time>
      </div>

      <p className="session-preview">{preview || `Session ${session.id.slice(0, 8)}`}</p>
    </button>
  );
};
