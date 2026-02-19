import { Fragment, type ReactNode } from 'react';

import { CodeBlockViewer } from './CodeBlockViewer';

interface MarkdownViewerProps {
  markdown: string;
}

interface MarkdownInlineProps {
  markdown: string;
  className?: string;
  keyPrefix?: string;
}

type MarkdownBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'code'; language: string; code: string };

function parseBlocks(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');

  let index = 0;
  while (index < lines.length) {
    const current = lines[index];

    if (current.trim().startsWith('```')) {
      const language = current.trim().slice(3).trim() || 'text';
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index]);
        index += 1;
      }

      blocks.push({
        type: 'code',
        language,
        code: codeLines.join('\n'),
      });

      index += 1;
      continue;
    }

    if (!current.trim()) {
      index += 1;
      continue;
    }

    const heading = current.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length,
        text: heading[2],
      });
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(current)) {
      const items: string[] = [current.replace(/^[-*]\s+/, '')];
      index += 1;

      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^[-*]\s+/, ''));
        index += 1;
      }

      blocks.push({ type: 'list', items });
      continue;
    }

    const paragraphLines = [current];
    index += 1;

    while (
      index < lines.length
      && lines[index].trim()
      && !lines[index].trim().startsWith('```')
      && !/^(#{1,6})\s+/.test(lines[index])
      && !/^[-*]\s+/.test(lines[index])
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }

    blocks.push({
      type: 'paragraph',
      text: paragraphLines.join(' '),
    });
  }

  return blocks;
}

function renderInline(markdown: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const tokenRegex = /(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(markdown)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(markdown.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith('`')) {
      nodes.push(
        <code key={`${keyPrefix}-${match.index}`} className="markdown-inline-code">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**')) {
      nodes.push(
        <strong key={`${keyPrefix}-${match.index}`}>
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('*')) {
      nodes.push(
        <em key={`${keyPrefix}-${match.index}`}>
          {token.slice(1, -1)}
        </em>,
      );
    } else if (token.startsWith('[')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        nodes.push(
          <a
            key={`${keyPrefix}-${match.index}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer"
            className="markdown-link"
          >
            {linkMatch[1]}
          </a>,
        );
      }
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < markdown.length) {
    nodes.push(markdown.slice(lastIndex));
  }

  return nodes;
}

export const MarkdownInline = ({
  markdown,
  className,
  keyPrefix = 'inline',
}: MarkdownInlineProps): JSX.Element => {
  const nodes = renderInline(markdown, keyPrefix);

  return (
    <span className={className}>
      {nodes.map((node, index) => (
        <Fragment key={`${keyPrefix}-${index}`}>{node}</Fragment>
      ))}
    </span>
  );
};

export const MarkdownViewer = ({ markdown }: MarkdownViewerProps): JSX.Element => {
  const blocks = parseBlocks(markdown);

  return (
    <div className="markdown-root">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const Tag = `h${Math.min(block.level, 4)}` as 'h1' | 'h2' | 'h3' | 'h4';
          return <Tag key={`${block.type}-${index}`}>{renderInline(block.text, `h-${index}`)}</Tag>;
        }

        if (block.type === 'code') {
          return (
            <CodeBlockViewer
              key={`${block.type}-${index}`}
              code={block.code}
              language={block.language}
              title={`code block ${index + 1}`}
            />
          );
        }

        if (block.type === 'list') {
          return (
            <ul key={`${block.type}-${index}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`${index}-${itemIndex}`}>{renderInline(item, `li-${index}-${itemIndex}`)}</li>
              ))}
            </ul>
          );
        }

        return (
          <p key={`${block.type}-${index}`}>
            {renderInline(block.text, `p-${index}`).map((node, nodeIndex) => (
              <Fragment key={`${index}-${nodeIndex}`}>{node}</Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
};
