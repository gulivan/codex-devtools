interface DiffViewerProps {
  before: string;
  after: string;
}

interface DiffLine {
  kind: 'added' | 'removed' | 'context';
  text: string;
}

function buildLcsMatrix(a: string[], b: string[]): number[][] {
  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0),
  );

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1] + 1;
      } else {
        matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1]);
      }
    }
  }

  return matrix;
}

function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const matrix = buildLcsMatrix(a, b);
  const lines: DiffLine[] = [];

  let i = a.length;
  let j = b.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      lines.push({ kind: 'context', text: a[i - 1] });
      i -= 1;
      j -= 1;
      continue;
    }

    if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
      lines.push({ kind: 'added', text: b[j - 1] });
      j -= 1;
      continue;
    }

    if (i > 0) {
      lines.push({ kind: 'removed', text: a[i - 1] });
      i -= 1;
    }
  }

  return lines.reverse();
}

export const DiffViewer = ({ before, after }: DiffViewerProps): JSX.Element => {
  const lines = diffLines(before, after);

  return (
    <div className="diff-shell">
      {lines.map((line, index) => (
        <div key={`${line.kind}-${index}-${line.text}`} className={`diff-line ${line.kind}`}>
          <span className="diff-prefix">{line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' '}</span>
          <code>{line.text || ' '}</code>
        </div>
      ))}
    </div>
  );
};
