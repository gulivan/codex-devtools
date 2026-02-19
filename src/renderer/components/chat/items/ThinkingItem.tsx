import { useMemo, useState } from 'react';

import { MarkdownViewer } from '../viewers/MarkdownViewer';

interface ThinkingItemProps {
  summary: string;
}

export const ThinkingItem = ({ summary }: ThinkingItemProps): JSX.Element => {
  const [expanded, setExpanded] = useState(false);

  const preview = useMemo(() => {
    const trimmed = summary.trim().replace(/\s+/g, ' ');
    if (trimmed.length <= 120) {
      return trimmed;
    }

    return `${trimmed.slice(0, 120)}…`;
  }, [summary]);

  return (
    <section className="chat-item-panel thinking">
      <button type="button" className="chat-item-header" onClick={() => setExpanded((value) => !value)}>
        <span>Thinking</span>
        <span className="chat-thinking-indicator">{expanded ? 'active' : 'summary'}</span>
      </button>

      <div className="chat-item-body">
        {expanded ? <MarkdownViewer markdown={summary} /> : <p className="thinking-preview">{preview}</p>}
      </div>
    </section>
  );
};
