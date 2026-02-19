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
    expect(chunks[1].toolExecutions[0].tokenUsage).toEqual({
      inputTokens: 20,
      outputTokens: 7,
    });
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

  it('deduplicates user text when response_item user arrives before event user_message', () => {
    const entries: CodexLogEntry[] = [
      {
        type: 'response_item',
        timestamp: '2026-02-19T00:09:33.530Z',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'how to build and run it?' }],
        },
      },
      {
        type: 'event_msg',
        timestamp: '2026-02-19T00:09:33.530Z',
        payload: {
          type: 'user_message',
          message: 'how to build and run it?',
        },
      },
      {
        type: 'event_msg',
        timestamp: '2026-02-19T00:09:34.000Z',
        payload: {
          type: 'agent_message',
          message: 'Checking scripts now.',
        },
      },
    ];

    const builder = new CodexChunkBuilder();
    const chunks = builder.buildChunks(entries);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({
      type: 'user',
      content: 'how to build and run it?',
      timestamp: '2026-02-19T00:09:33.530Z',
    });

    if (chunks[1].type !== 'ai') {
      throw new Error('Expected AI chunk');
    }

    expect(chunks[1].textBlocks).toEqual(['Checking scripts now.']);
  });

  it('deduplicates attachment messages and strips wrapper tags', () => {
    const entries: CodexLogEntry[] = [
      {
        type: 'response_item',
        timestamp: '2026-02-19T07:50:08.225Z',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: '<image name=[Image #1]>' },
            { type: 'input_image', image_url: 'data:image/png;base64,abc' },
            { type: 'input_text', text: '</image>' },
            { type: 'input_text', text: '[Image #1]\n\nwhy the model in sidebar is unknown?' },
          ],
        },
      },
      {
        type: 'event_msg',
        timestamp: '2026-02-19T07:50:08.225Z',
        payload: {
          type: 'user_message',
          message: '[Image #1]\n\nwhy the model in sidebar is unknown?',
        },
      },
      {
        type: 'event_msg',
        timestamp: '2026-02-19T07:50:09.000Z',
        payload: {
          type: 'agent_message',
          message: 'Checking parser now.',
        },
      },
    ];

    const builder = new CodexChunkBuilder();
    const chunks = builder.buildChunks(entries);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({
      type: 'user',
      content: '[Image #1]\n\nwhy the model in sidebar is unknown?',
      timestamp: '2026-02-19T07:50:08.225Z',
    });

    if (chunks[1].type !== 'ai') {
      throw new Error('Expected AI chunk');
    }

    expect(chunks[1].textBlocks).toEqual(['Checking parser now.']);
  });

  it('prefers user message variant that preserves image placeholders when equivalent', () => {
    const entries: CodexLogEntry[] = [
      {
        type: 'response_item',
        timestamp: '2026-02-18T22:39:16.887Z',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: '<image name=[Image #1]>' },
            { type: 'input_image', image_url: 'data:image/png;base64,abc' },
            { type: 'input_text', text: '</image>' },
            { type: 'input_text', text: 'check git diff and review code' },
          ],
        },
      },
      {
        type: 'event_msg',
        timestamp: '2026-02-18T22:39:16.888Z',
        payload: {
          type: 'user_message',
          message: 'check git diff and review code\n[Image #1]',
        },
      },
      {
        type: 'event_msg',
        timestamp: '2026-02-18T22:39:17.000Z',
        payload: {
          type: 'agent_message',
          message: 'Starting review.',
        },
      },
    ];

    const builder = new CodexChunkBuilder();
    const chunks = builder.buildChunks(entries);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({
      type: 'user',
      content: 'check git diff and review code\n[Image #1]',
      timestamp: '2026-02-18T22:39:16.888Z',
    });

    if (chunks[1].type !== 'ai') {
      throw new Error('Expected AI chunk');
    }

    expect(chunks[1].textBlocks).toEqual(['Starting review.']);
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

  it('inserts a model change chunk when turn_context model changes', () => {
    const entries: CodexLogEntry[] = [
      {
        type: 'turn_context',
        timestamp: '2026-02-18T22:30:00.000Z',
        payload: {
          cwd: '/repo/project-a',
          model: 'gpt-5',
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-18T22:30:01.000Z',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'first prompt' }],
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-18T22:30:02.000Z',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'first response' }],
        },
      },
      {
        type: 'turn_context',
        timestamp: '2026-02-18T22:30:03.000Z',
        payload: {
          cwd: '/repo/project-a',
          model: 'gpt-5.3-codex',
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-18T22:30:04.000Z',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'second prompt' }],
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-18T22:30:05.000Z',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'second response' }],
        },
      },
    ];

    const builder = new CodexChunkBuilder();
    const chunks = builder.buildChunks(entries);

    expect(chunks).toHaveLength(5);
    expect(chunks[0].type).toBe('user');
    expect(chunks[1].type).toBe('ai');
    expect(chunks[2].type).toBe('model_change');
    expect(chunks[3].type).toBe('user');
    expect(chunks[4].type).toBe('ai');

    if (chunks[2].type !== 'model_change') {
      throw new Error('Expected model_change chunk');
    }

    expect(chunks[2].previousModel).toBe('gpt-5');
    expect(chunks[2].model).toBe('gpt-5.3-codex');
    expect(chunks[2].timestamp).toBe('2026-02-18T22:30:03.000Z');
  });
});
