import type { ReactNode } from 'react';

interface CodeBlockViewerProps {
  code: string;
  language?: string;
  title?: string;
}

function isKeyword(token: string): boolean {
  return new Set([
    'const',
    'let',
    'var',
    'function',
    'return',
    'if',
    'else',
    'for',
    'while',
    'switch',
    'case',
    'break',
    'import',
    'from',
    'export',
    'type',
    'interface',
    'async',
    'await',
    'class',
    'new',
    'true',
    'false',
    'null',
    'undefined',
  ]).has(token);
}

function highlightLine(line: string, lineKey: string): ReactNode[] {
  const result: ReactNode[] = [];
  const tokenRegex = /(\/\/.*$|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b\d+(?:\.\d+)?\b|\b[a-zA-Z_][a-zA-Z0-9_]*\b)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(line)) !== null) {
    const [token] = match;

    if (match.index > lastIndex) {
      result.push(line.slice(lastIndex, match.index));
    }

    let className = 'code-token';

    if (token.startsWith('//')) {
      className = 'code-token comment';
    } else if (token.startsWith('"') || token.startsWith("'") || token.startsWith('`')) {
      className = 'code-token string';
    } else if (/^\d/.test(token)) {
      className = 'code-token number';
    } else if (isKeyword(token)) {
      className = 'code-token keyword';
    }

    result.push(
      <span key={`${lineKey}-${match.index}`} className={className}>
        {token}
      </span>,
    );

    lastIndex = match.index + token.length;
  }

  if (lastIndex < line.length) {
    result.push(line.slice(lastIndex));
  }

  return result;
}

export const CodeBlockViewer = ({ code, language = 'text', title }: CodeBlockViewerProps): JSX.Element => {
  const lines = code.split('\n');

  return (
    <div className="code-viewer-shell">
      <div className="code-viewer-header">
        <span>{title ?? 'Code'}</span>
        <span className="code-language">{language}</span>
      </div>

      <pre className="code-viewer-pre">
        {lines.map((line, index) => (
          <code key={`${index}-${line}`} className="code-line">
            <span className="code-line-number">{index + 1}</span>
            <span className="code-line-content">{highlightLine(line, `${index}`)}</span>
          </code>
        ))}
      </pre>
    </div>
  );
};
