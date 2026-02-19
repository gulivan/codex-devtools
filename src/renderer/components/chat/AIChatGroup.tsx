import { useMemo } from 'react';

import { format } from 'date-fns';

import { ExecutionTrace } from './items/ExecutionTrace';
import { ExecutionTraceGroup, isExecCommandExecution } from './items/ExecutionTraceGroup';
import { MetricsPill } from './items/MetricsPill';
import { TextItem } from './items/TextItem';
import { ThinkingItem } from './items/ThinkingItem';

import type { AIChunk, AIChunkSection, CodexToolExecution } from '@main/types';

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

function buildToolRows(executions: CodexToolExecution[]): ToolExecutionRow[] {
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

  for (const execution of executions) {
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
}

export const AIChatGroup = ({ chunk }: AIChatGroupProps): JSX.Element => {
  const sections = useMemo<AIChunkSection[]>(() => {
    if (Array.isArray(chunk.sections) && chunk.sections.length > 0) {
      return chunk.sections;
    }

    const fallback: AIChunkSection[] = [];
    if (chunk.textBlocks.length > 0) {
      fallback.push({
        type: 'message',
        textBlocks: chunk.textBlocks,
      });
    }

    if (chunk.reasoning.length > 0) {
      fallback.push({
        type: 'reasoning',
        summaries: chunk.reasoning,
      });
    }

    if (chunk.toolExecutions.length > 0) {
      fallback.push({
        type: 'tool_executions',
        executions: chunk.toolExecutions,
      });
    }

    return fallback;
  }, [chunk.sections, chunk.textBlocks, chunk.reasoning, chunk.toolExecutions]);

  let hasRenderedToolsTitle = false;

  return (
    <article className="chat-ai-card">
      <header className="chat-ai-header">
        <div>
          <p className="chat-ai-title">Codex</p>
          <time className="chat-ai-time">{format(new Date(chunk.timestamp), 'p')}</time>
        </div>
        <MetricsPill metrics={chunk.metrics} durationMs={chunk.duration} />
      </header>

      {sections.map((section, index) => {
        if (section.type === 'message') {
          const markdown = section.textBlocks.join('\n\n').trim();
          if (!markdown) {
            return null;
          }

          return (
            <TextItem
              key={`message-${chunk.timestamp}-${index}`}
              label="Response"
              markdown={markdown}
              defaultExpanded
            />
          );
        }

        if (section.type === 'reasoning') {
          if (section.summaries.length === 0) {
            return null;
          }

          return <ThinkingItem key={`reasoning-${chunk.timestamp}-${index}`} summaries={section.summaries} />;
        }

        if (section.executions.length === 0) {
          return null;
        }

        const toolRows = buildToolRows(section.executions);
        const showToolsTitle = !hasRenderedToolsTitle;
        hasRenderedToolsTitle = true;
        return (
          <section key={`tools-${chunk.timestamp}-${index}`} className="chat-tools-section">
            {showToolsTitle ? <h4 className="chat-tools-title">Tool executions</h4> : null}
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
        );
      })}
    </article>
  );
};
