import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AIChatGroup } from '@renderer/components/chat/AIChatGroup';
import { ThinkingItem } from '@renderer/components/chat/items/ThinkingItem';

import type { AIChunk, CodexToolExecution } from '@main/types';

function buildExecution(callId: string, name: string, cmd: string): CodexToolExecution {
  return {
    functionCall: {
      name,
      arguments: JSON.stringify({ cmd }),
      callId,
    },
    functionOutput: {
      callId,
      output: JSON.stringify({ metadata: { exit_code: 0 } }),
      isError: false,
    },
    duration: 10,
    tokenUsage: {
      inputTokens: 10,
      cachedInputTokens: 0,
      outputTokens: 5,
    },
  };
}

describe('chat rendering', () => {
  it('renders codex heading, single tool title, and terminal styling for exec commands', () => {
    const executionOne = buildExecution('call-1', 'exec_command', 'sed -n 1,40p src/file.ts');
    const executionTwo = buildExecution('call-2', 'read_file', '/tmp/file.txt');
    const chunk: AIChunk = {
      type: 'ai',
      textBlocks: [],
      reasoning: [],
      toolExecutions: [executionOne, executionTwo],
      sections: [
        { type: 'tool_executions', executions: [executionOne] },
        { type: 'reasoning', summaries: ['Checking command output'] },
        { type: 'tool_executions', executions: [executionTwo] },
      ],
      metrics: {},
      timestamp: '2026-02-19T11:10:00.000Z',
      duration: 1200,
    };

    const html = renderToStaticMarkup(createElement(AIChatGroup, { chunk }));

    expect(html).toContain('Codex');
    expect(html.match(/Tool executions/g)).toHaveLength(1);
    expect(html).toContain('trace-terminal-line');
    expect(html).toContain('lucide-wrench');
    expect(html).toContain('$ sed -n 1,40p src/file.ts');
  });

  it('renders compact non-interactive reasoning for up to three summaries', () => {
    const html = renderToStaticMarkup(
      createElement(ThinkingItem, {
        summaries: ['step one', '**step two**', 'step three\n- nested bullet'],
      }),
    );

    expect(html).toContain('thinking-compact-body');
    expect(html).toContain('lucide-brain');
    expect(html).not.toContain('chat-item-header');
    expect(html).toContain('thinking-compact-list');
    expect(html).toContain('thinking-dash-prefix');
    expect(html).toContain('step one');
    expect(html).toContain('step two');
    expect(html).not.toContain('**');
    expect(html).not.toContain('3 step');
    expect(html).not.toContain('Reasoning Trace');
  });

  it('keeps reasoning collapsed by default when summaries exceed three entries', () => {
    const html = renderToStaticMarkup(
      createElement(ThinkingItem, {
        summaries: ['step one', 'step two', 'step three', 'step four'],
      }),
    );

    expect(html).not.toContain('<ul>');
    expect(html).toContain('(+3 more)');
    expect(html).toContain('4 steps');
    expect(html).toContain('lucide-brain');
  });
});
