import { useState } from 'react';

import { MarkdownViewer } from '../viewers/MarkdownViewer';

interface TextItemProps {
  label?: string;
  markdown: string;
  defaultExpanded?: boolean;
}

export const TextItem = ({ label = 'Text', markdown, defaultExpanded = false }: TextItemProps): JSX.Element => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <section className="chat-item-panel">
      <button type="button" className="chat-item-header" onClick={() => setExpanded((value) => !value)}>
        <span>{label}</span>
        <span className="chat-item-chevron">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded ? (
        <div className="chat-item-body">
          <MarkdownViewer markdown={markdown} />
        </div>
      ) : null}
    </section>
  );
};
