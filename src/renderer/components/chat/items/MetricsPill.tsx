import type { CodexSessionMetrics } from '@main/types';

interface MetricsPillProps {
  metrics: Partial<CodexSessionMetrics>;
  durationMs?: number;
}

function formatDuration(ms: number): string {
  if (ms < 1_000) {
    return `${ms}ms`;
  }

  const seconds = Math.round(ms / 100) / 10;
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${minutes}m ${remaining}s`;
}

export const MetricsPill = ({ metrics, durationMs = 0 }: MetricsPillProps): JSX.Element | null => {
  const totalTokens = metrics.totalTokens ?? 0;
  const outputTokens = metrics.outputTokens ?? 0;

  if (totalTokens === 0 && durationMs === 0) {
    return null;
  }

  return (
    <div className="metrics-pill">
      <span>{totalTokens.toLocaleString()} tokens</span>
      <span className="metrics-divider">•</span>
      <span>{outputTokens.toLocaleString()} out</span>
      <span className="metrics-divider">•</span>
      <span>{formatDuration(durationMs)}</span>
    </div>
  );
};
