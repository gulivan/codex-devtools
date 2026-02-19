import { useMemo, useState } from 'react';

import { Brain } from 'lucide-react';

import { notifyChatLayoutInvalidated } from '../chatLayoutEvents';

interface ThinkingItemProps {
  summaries: string[];
}

const MAX_PREVIEW_LENGTH = 140;

function normalizeSummary(summary: string): string {
  return summary.replace(/\r\n/g, '\n').replace(/\*\*/g, '').trim();
}

function truncatePreview(text: string): string {
  if (text.length <= MAX_PREVIEW_LENGTH) {
    return text;
  }

  return `${text.slice(0, MAX_PREVIEW_LENGTH)}...`;
}

export const ThinkingItem = ({ summaries }: ThinkingItemProps): JSX.Element | null => {
  const normalizedSummaries = useMemo(
    () => summaries.map(normalizeSummary).filter(Boolean),
    [summaries],
  );

  const reasoningCount = normalizedSummaries.length;
  const shouldDefaultExpand = reasoningCount > 0 && reasoningCount <= 3;
  const [expanded, setExpanded] = useState(shouldDefaultExpand);

  const preview = useMemo(() => {
    const first = normalizedSummaries[0] ?? '';
    return truncatePreview(first);
  }, [normalizedSummaries]);

  if (reasoningCount === 0) {
    return null;
  }

  if (shouldDefaultExpand) {
    const compactBodyClassName =
      reasoningCount === 1 ? 'chat-item-body thinking-compact-body single' : 'chat-item-body thinking-compact-body';

    return (
      <section className="chat-item-panel thinking compact">
        <div className={compactBodyClassName}>
          <span className="thinking-icon-wrap" aria-hidden="true">
            <Brain size={14} />
          </span>
          {reasoningCount === 1 ? (
            <p className="thinking-plain-text">{normalizedSummaries[0]}</p>
          ) : (
            <ul className="thinking-compact-list">
              {normalizedSummaries.map((summary, index) => (
                <li key={`thinking-compact-${index}`} className="thinking-dash-item">
                  <span className="thinking-dash-prefix" aria-hidden="true">
                    -
                  </span>
                  <span className="thinking-plain-text">{summary}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    );
  }

  const additionalReasoningLabel = reasoningCount > 1 ? ` (+${reasoningCount - 1} more)` : '';

  return (
    <section className="chat-item-panel thinking">
      <button
        type="button"
        className="chat-item-header"
        onClick={() => {
          setExpanded((value) => !value);
          notifyChatLayoutInvalidated();
        }}
      >
        <span className="thinking-header-main">
          <span className="thinking-icon-wrap" aria-hidden="true">
            <Brain size={14} />
          </span>
        </span>
        <span className="chat-thinking-indicator">{reasoningCount} steps</span>
      </button>

      <div className="chat-item-body">
        {expanded ? (
          <ul className="thinking-expanded-list">
            {normalizedSummaries.map((summary, index) => (
              <li key={`thinking-expanded-${index}`} className="thinking-dash-item">
                <span className="thinking-dash-prefix" aria-hidden="true">
                  -
                </span>
                <span className="thinking-plain-text">{summary}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="thinking-preview">
            <span className="thinking-plain-text">{preview}</span>
            {additionalReasoningLabel}
          </p>
        )}
      </div>
    </section>
  );
};
