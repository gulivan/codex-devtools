import { CodexChunkBuilder } from '../../src/main/services/analysis/CodexChunkBuilder';
import { type CodexLogEntry } from '../../src/main/types';

describe('CodexChunkBuilder', () => {
  it('builds user, ai, and system chunks and links tool outputs by call_id', () => {
    const entries: CodexLogEntry[] = [
      {
        type: 'response_item',
        timestamp: '2026-02-18T22:00:00.000Z',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Run tests' }],
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-18T22:00:01.000Z',
        payload: {
          type: 'function_call',
          name: 'shell_command',
          arguments: '{"cmd":"pnpm test"}',
          call_id: 'call-1',
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-18T22:00:02.000Z',
        payload: {
          type: 'function_call_output',
          call_id: 'call-1',
          output: '{"metadata":{"exit_code":2}}',
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-18T22:00:03.000Z',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Tests failed in one suite.' }],
        },
      },
      {
        type: 'event_msg',
        timestamp: '2026-02-18T22:00:04.000Z',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: 20,
              cached_input_tokens: 3,
              output_tokens: 7,
              reasoning_output_tokens: 1,
              total_tokens: 31,
            },
            last_token_usage: {
              input_tokens: 20,
              cached_input_tokens: 3,
              output_tokens: 7,
              reasoning_output_tokens: 1,
              total_tokens: 31,
            },
            model_context_window: 200_000,
          },
          rate_limits: null,
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-18T22:00:05.000Z',
        payload: {
          type: 'message',
          role: 'developer',
          content: [{ type: 'input_text', text: 'internal policy note' }],
        },
      },
    ];

    const builder = new CodexChunkBuilder();
    const chunks = builder.buildChunks(entries);

    expect(chunks).toHaveLength(3);
    expect(chunks[0].type).toBe('user');
    expect(chunks[1].type).toBe('ai');
    expect(chunks[2].type).toBe('system');

    if (chunks[1].type !== 'ai') {
      throw new Error('Expected AI chunk');
    }

    expect(chunks[1].textBlocks).toEqual(['Tests failed in one suite.']);
    expect(chunks[1].toolExecutions).toHaveLength(1);
    expect(chunks[1].toolExecutions[0].functionOutput?.isError).toBe(true);
    expect(chunks[1].metrics.totalTokens).toBe(31);
    expect(chunks[1].metrics.toolCallCount).toBe(1);
    expect(chunks[1].duration).toBeGreaterThan(0);
  });

  it('prefers response items over duplicate event messages for user and assistant text', () => {
    const entries: CodexLogEntry[] = [
      {
        type: 'event_msg',
        timestamp: '2026-02-18T22:10:00.000Z',
        payload: {
          type: 'user_message',
          message: 'how to build and run it?',
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-18T22:10:00.200Z',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'how to build and run it?' }],
        },
      },
      {
        type: 'event_msg',
        timestamp: '2026-02-18T22:10:01.000Z',
        payload: {
          type: 'agent_message',
          message: 'I found no README in the repo root.',
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-18T22:10:01.200Z',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'I found no README in the repo root.' }],
        },
      },
      {
        type: 'event_msg',
        timestamp: '2026-02-18T22:10:01.400Z',
        payload: {
          type: 'agent_reasoning',
          text: 'Inspecting package scripts',
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-18T22:10:01.600Z',
        payload: {
          type: 'reasoning',
          summary: [{ text: 'Inspecting package scripts' }],
        },
      },
    ];

    const builder = new CodexChunkBuilder();
    const chunks = builder.buildChunks(entries);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({
      type: 'user',
      content: 'how to build and run it?',
      timestamp: '2026-02-18T22:10:00.200Z',
    });

    if (chunks[1].type !== 'ai') {
      throw new Error('Expected AI chunk');
    }

    expect(chunks[1].textBlocks).toEqual(['I found no README in the repo root.']);
    expect(chunks[1].reasoning).toEqual(['Inspecting package scripts']);
  });

  it('falls back to event messages when response items are absent', () => {
    const entries: CodexLogEntry[] = [
      {
        type: 'event_msg',
        timestamp: '2026-02-18T22:20:00.000Z',
        payload: {
          type: 'user_message',
          message: 'summarize this session',
        },
      },
      {
        type: 'event_msg',
        timestamp: '2026-02-18T22:20:01.000Z',
        payload: {
          type: 'agent_message',
          message: 'Here is a short summary.',
        },
      },
      {
        type: 'event_msg',
        timestamp: '2026-02-18T22:20:01.100Z',
        payload: {
          type: 'agent_reasoning',
          text: 'Prioritized key updates',
        },
      },
    ];

    const builder = new CodexChunkBuilder();
    const chunks = builder.buildChunks(entries);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({
      type: 'user',
      content: 'summarize this session',
      timestamp: '2026-02-18T22:20:00.000Z',
    });

    if (chunks[1].type !== 'ai') {
      throw new Error('Expected AI chunk');
    }

    expect(chunks[1].textBlocks).toEqual(['Here is a short summary.']);
    expect(chunks[1].reasoning).toEqual(['Prioritized key updates']);
  });
});
