import { format } from 'date-fns';

import type { CodexSession } from '@main/types';

interface SessionItemProps {
  session: CodexSession;
  isActive: boolean;
  preview: string;
  hasUpdate: boolean;
  onSelect: () => void;
}

function formatModelBadgeLabel(model: string, reasoningEffort: string): string {
  return `${model} · ${reasoningEffort}`;
}

function formatSessionSize(fileSizeBytes: number | undefined): string | null {
  if (typeof fileSizeBytes !== 'number' || !Number.isFinite(fileSizeBytes) || fileSizeBytes < 0) {
    return null;
  }

  if (fileSizeBytes < 1024) {
    return `${fileSizeBytes} B`;
  }

  const kilobytes = fileSizeBytes / 1024;
  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(kilobytes >= 100 ? 0 : 1)} KB`;
  }

  const megabytes = kilobytes / 1024;
  return `${megabytes.toFixed(megabytes >= 100 ? 0 : 1)} MB`;
}

export const SessionItem = ({
  session,
  isActive,
  preview,
  hasUpdate,
  onSelect,
}: SessionItemProps): JSX.Element => {
  const firstUsage =
    Array.isArray(session.modelUsages) && session.modelUsages.length > 0
      ? session.modelUsages[0]
      : session.model
        ? { model: session.model, reasoningEffort: 'unknown' }
        : null;
  const badgeLabel = firstUsage
    ? firstUsage.reasoningEffort === 'unknown'
      ? firstUsage.model
      : formatModelBadgeLabel(firstUsage.model, firstUsage.reasoningEffort)
    : 'unknown-model';
  const sizeLabel = formatSessionSize(session.fileSizeBytes);

  return (
    <button type="button" onClick={onSelect} className={`session-item ${isActive ? 'active' : ''}`}>
      <div className="session-item-header">
        <div className="session-item-header-left">
          <span className="session-model-badge">{badgeLabel}</span>
          {hasUpdate ? (
            <span className="session-update-dot" title="New activity" aria-label="New activity" />
          ) : null}
        </div>
        <div className="session-item-meta">
          <time className="session-time">{format(new Date(session.startTime), 'p')}</time>
          {sizeLabel ? <span className="session-size">{sizeLabel}</span> : null}
        </div>
      </div>

      <p className="session-preview">{preview || `Session ${session.id.slice(0, 8)}`}</p>
    </button>
  );
};
