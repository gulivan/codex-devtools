import { useMemo } from 'react';

import { format } from 'date-fns';

import { ExecutionTrace } from './items/ExecutionTrace';
import { ExecutionTraceGroup, isExecCommandExecution } from './items/ExecutionTraceGroup';
import { MetricsPill } from './items/MetricsPill';
import { TextItem } from './items/TextItem';
import { ThinkingItem } from './items/ThinkingItem';

import type { AIChunk, CodexToolExecution } from '@main/types';

interface AIChatGroupProps {
  chunk: AIChunk;
}

type ToolExecutionRow =
  | {
      type: 'group';
      key: string;
      executions: CodexToolExecution[];
    }
  | {
      type: 'single';
      key: string;
      execution: CodexToolExecution;
    };

export const AIChatGroup = ({ chunk }: AIChatGroupProps): JSX.Element => {
  const combinedText = useMemo(() => chunk.textBlocks.join('\n\n').trim(), [chunk.textBlocks]);
  const toolRows = useMemo(() => {
    const rows: ToolExecutionRow[] = [];
    let pendingExecCommands: CodexToolExecution[] = [];

    const flushPendingExecCommands = (): void => {
      if (pendingExecCommands.length === 0) {
        return;
      }

      if (pendingExecCommands.length === 1) {
        const execution = pendingExecCommands[0];
        rows.push({
          type: 'single',
          key: execution.functionCall.callId,
          execution,
        });
      } else {
        rows.push({
          type: 'group',
          key: `exec-group-${pendingExecCommands[0].functionCall.callId}`,
          executions: pendingExecCommands,
        });
      }

      pendingExecCommands = [];
    };

    for (const execution of chunk.toolExecutions) {
      if (isExecCommandExecution(execution)) {
        pendingExecCommands.push(execution);
        continue;
      }

      flushPendingExecCommands();
      rows.push({
        type: 'single',
        key: execution.functionCall.callId,
        execution,
      });
    }

    flushPendingExecCommands();
    return rows;
  }, [chunk.toolExecutions]);

  return (
    <article className="chat-ai-card">
      <header className="chat-ai-header">
        <div>
          <p className="chat-ai-title">Assistant</p>
          <time className="chat-ai-time">{format(new Date(chunk.timestamp), 'p')}</time>
        </div>
        <MetricsPill metrics={chunk.metrics} durationMs={chunk.duration} />
      </header>

      {combinedText ? <TextItem label="Response" markdown={combinedText} defaultExpanded /> : null}

      {chunk.reasoning.length > 0 ? <ThinkingItem summaries={chunk.reasoning} /> : null}

      {chunk.toolExecutions.length > 0 ? (
        <section className="chat-tools-section">
          <h4 className="chat-tools-title">Tool executions</h4>
          <div className="chat-tools-list">
            {toolRows.map((row) =>
              row.type === 'group' ? (
                <ExecutionTraceGroup key={row.key} executions={row.executions} />
              ) : (
                <ExecutionTrace key={row.key} execution={row.execution} />
              ),
            )}
          </div>
        </section>
      ) : null}
    </article>
  );
};
