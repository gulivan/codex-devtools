import { useMemo } from 'react';

import { format } from 'date-fns';

import { ExecutionTrace } from './items/ExecutionTrace';
import { MetricsPill } from './items/MetricsPill';
import { TextItem } from './items/TextItem';
import { ThinkingItem } from './items/ThinkingItem';

import type { AIChunk } from '@main/types';

interface AIChatGroupProps {
  chunk: AIChunk;
}

export const AIChatGroup = ({ chunk }: AIChatGroupProps): JSX.Element => {
  const combinedText = useMemo(() => chunk.textBlocks.join('\n\n').trim(), [chunk.textBlocks]);

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

      {chunk.reasoning.map((reasoning, index) => (
        <ThinkingItem key={`${chunk.timestamp}-reasoning-${index}`} summary={reasoning} />
      ))}

      {chunk.toolExecutions.length > 0 ? (
        <section className="chat-tools-section">
          <h4 className="chat-tools-title">Tool executions</h4>
          <div className="chat-tools-list">
            {chunk.toolExecutions.map((execution) => (
              <ExecutionTrace key={execution.functionCall.callId} execution={execution} />
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
};
