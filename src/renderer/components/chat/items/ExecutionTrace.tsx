import { useMemo, useState } from 'react';

import { Wrench } from 'lucide-react';

import { CodeBlockViewer } from '../viewers/CodeBlockViewer';
import { MarkdownViewer } from '../viewers/MarkdownViewer';
import { notifyChatLayoutInvalidated } from '../chatLayoutEvents';
import { isTerminalCommandExecution } from './toolExecutionUtils';

import type { CodexToolExecution } from '@main/types';

interface ExecutionTraceProps {
  execution: CodexToolExecution;
}

const COMMAND_ARGUMENT_KEYS = ['cmd', 'command'] as const;
const MAX_COMMAND_PREVIEW_LENGTH = 120;

function prettyPrintJson(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncateMiddle(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function extractStringValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const text = compactWhitespace(value);
    return text ? text : null;
  }

  if (Array.isArray(value)) {
    const pieces = value.filter((piece): piece is string => typeof piece === 'string').map(compactWhitespace);
    const text = pieces.filter(Boolean).join(' ');
    return text ? text : null;
  }

  return null;
}

function parseCommandPreview(execution: CodexToolExecution): string | null {
  const normalizedName = execution.functionCall.name.toLowerCase();
  if (!normalizedName.includes('command') && !normalizedName.includes('exec')) {
    return null;
  }

  try {
    const parsed = JSON.parse(execution.functionCall.arguments) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    const argumentRecord = parsed as Record<string, unknown>;
    for (const key of COMMAND_ARGUMENT_KEYS) {
      const candidate = extractStringValue(argumentRecord[key]);
      if (candidate) {
        return truncateMiddle(candidate, MAX_COMMAND_PREVIEW_LENGTH);
      }
    }
  } catch {
    return null;
  }

  return null;
}

export const ExecutionTrace = ({ execution }: ExecutionTraceProps): JSX.Element => {
  const [expanded, setExpanded] = useState(false);

  const output = execution.functionOutput?.output ?? '';
  const commandPreview = useMemo(() => parseCommandPreview(execution), [execution]);
  const isTerminalCommand = useMemo(() => isTerminalCommandExecution(execution), [execution]);
  const tokenUsageLabel = execution.tokenUsage
    ? `${execution.tokenUsage.inputTokens.toLocaleString()} in (${(execution.tokenUsage.cachedInputTokens ?? 0).toLocaleString()} cached + ${Math.max(
      execution.tokenUsage.inputTokens - (execution.tokenUsage.cachedInputTokens ?? 0),
      0,
    ).toLocaleString()} uncached) • ${execution.tokenUsage.outputTokens.toLocaleString()} out`
    : null;
  const formattedArguments = useMemo(
    () => prettyPrintJson(execution.functionCall.arguments),
    [execution.functionCall.arguments],
  );
  const formattedOutput = useMemo(() => prettyPrintJson(output), [output]);

  return (
    <section
      className={`trace-card ${execution.functionOutput?.isError ? 'error' : ''} ${isTerminalCommand ? 'terminal' : ''}`}
    >
      <button
        type="button"
        className="trace-header"
        onClick={() => {
          setExpanded((value) => !value);
          notifyChatLayoutInvalidated();
        }}
      >
        <div className="trace-header-main">
          <span className="trace-name">
            {isTerminalCommand ? <Wrench size={13} className="trace-name-icon" aria-hidden="true" /> : null}
            <span>{execution.functionCall.name}</span>
          </span>
          {commandPreview ? (
            <span className={`trace-command-preview ${isTerminalCommand ? 'trace-terminal-line' : ''}`}>
              {isTerminalCommand ? `$ ${commandPreview}` : commandPreview}
            </span>
          ) : null}
        </div>
        <div className="trace-header-meta">
          {tokenUsageLabel ? <span className="trace-token-usage">{tokenUsageLabel}</span> : null}
          <span className="trace-meta">{expanded ? 'Hide' : 'Show'} trace</span>
        </div>
      </button>

      {expanded ? (
        <div className="trace-body">
          <h5>Arguments</h5>
          <CodeBlockViewer code={formattedArguments} language="json" title="function_call.arguments" />

          <h5>Output</h5>
          {formattedOutput.includes('\n') || formattedOutput.startsWith('{') || formattedOutput.startsWith('[') ? (
            <CodeBlockViewer code={formattedOutput} language="json" title="function_call_output.output" />
          ) : (
            <MarkdownViewer markdown={formattedOutput || '_No output yet_'} />
          )}
        </div>
      ) : null}
    </section>
  );
};
