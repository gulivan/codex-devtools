import { useMemo, useState } from 'react';

import { MarkdownInline, MarkdownViewer } from '../viewers/MarkdownViewer';

interface ThinkingItemProps {
  summaries: string[];
  title?: string;
}

const MAX_PREVIEW_LENGTH = 140;

function normalizeSummary(summary: string): string {
  return summary.trim().replace(/\s+/g, ' ');
}

function truncatePreview(text: string): string {
  if (text.length <= MAX_PREVIEW_LENGTH) {
    return text;
  }

  return `${text.slice(0, MAX_PREVIEW_LENGTH)}...`;
}

export const ThinkingItem = ({ summaries, title = 'Reasoning Trace' }: ThinkingItemProps): JSX.Element | null => {
  const [expanded, setExpanded] = useState(false);

  const normalizedSummaries = useMemo(
    () => summaries.map(normalizeSummary).filter(Boolean),
    [summaries],
  );

  const reasoningCount = normalizedSummaries.length;

  const preview = useMemo(() => {
    const first = normalizedSummaries[0] ?? '';
    return truncatePreview(first);
  }, [normalizedSummaries]);

  const combinedMarkdown = useMemo(
    () => normalizedSummaries.map((summary) => `- ${summary}`).join('\n'),
    [normalizedSummaries],
  );

  if (reasoningCount === 0) {
    return null;
  }

  const additionalReasoningLabel = reasoningCount > 1 ? ` (+${reasoningCount - 1} more)` : '';

  return (
    <section className="chat-item-panel thinking">
      <button type="button" className="chat-item-header" onClick={() => setExpanded((value) => !value)}>
        <span>{title}</span>
        <span className="chat-thinking-indicator">{reasoningCount} step{reasoningCount === 1 ? '' : 's'}</span>
      </button>

      <div className="chat-item-body">
        {expanded ? (
          <MarkdownViewer markdown={combinedMarkdown} />
        ) : (
          <p className="thinking-preview">
            <MarkdownInline markdown={preview} keyPrefix="thinking-preview" />
            {additionalReasoningLabel}
          </p>
        )}
      </div>
    </section>
  );
};
