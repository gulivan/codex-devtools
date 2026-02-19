import { useMemo, useState } from 'react';

import { Wrench } from 'lucide-react';

import { ExecutionTrace } from './ExecutionTrace';
import { isTerminalCommandExecution } from './toolExecutionUtils';
import { notifyChatLayoutInvalidated } from '../chatLayoutEvents';

import type { CodexToolExecution } from '@main/types';

interface ExecutionTraceGroupProps {
  executions: CodexToolExecution[];
  title?: string;
}

export function isExecCommandExecution(execution: CodexToolExecution): boolean {
  return isTerminalCommandExecution(execution);
}

export const ExecutionTraceGroup = ({
  executions,
  title = 'Exec commands',
}: ExecutionTraceGroupProps): JSX.Element | null => {
  const [expanded, setExpanded] = useState(false);

  const tokenTotals = useMemo(() => {
    let inputTokens = 0;
    let outputTokens = 0;
    let hasTokenUsage = false;

    for (const execution of executions) {
      if (!execution.tokenUsage) {
        continue;
      }

      hasTokenUsage = true;
      inputTokens += execution.tokenUsage.inputTokens;
      outputTokens += execution.tokenUsage.outputTokens;
    }

    return { hasTokenUsage, inputTokens, outputTokens };
  }, [executions]);

  if (executions.length === 0) {
    return null;
  }

  const countLabel = `${executions.length} command${executions.length === 1 ? '' : 's'}`;
  const tokenUsageLabel = tokenTotals.hasTokenUsage
    ? `${tokenTotals.inputTokens.toLocaleString()} in • ${tokenTotals.outputTokens.toLocaleString()} out`
    : null;

  return (
    <section className="trace-group-card">
      <button
        type="button"
        className="trace-group-header"
        onClick={() => {
          setExpanded((value) => !value);
          notifyChatLayoutInvalidated();
        }}
      >
        <div className="trace-header-main">
          <span className="trace-name">
            <Wrench size={13} className="trace-name-icon" aria-hidden="true" />
            <span>{title}</span>
          </span>
          <span className="trace-command-preview">{countLabel}</span>
        </div>

        <div className="trace-header-meta">
          {tokenUsageLabel ? <span className="trace-token-usage">{tokenUsageLabel}</span> : null}
          <span className="trace-meta">{expanded ? 'Hide' : 'Show'} all</span>
        </div>
      </button>

      {expanded ? (
        <div className="trace-group-body">
          <div className="chat-tools-list">
            {executions.map((execution) => (
              <ExecutionTrace key={execution.functionCall.callId} execution={execution} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
};
