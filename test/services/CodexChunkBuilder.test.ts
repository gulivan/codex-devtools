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

  it('builds ordered assistant sections while grouping reasoning and tool executions', () => {
    const entries: CodexLogEntry[] = [
      {
        type: 'response_item',
        timestamp: '2026-02-18T22:11:00.000Z',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'run check' }],
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-18T22:11:01.000Z',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Starting checks.' }],
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-18T22:11:02.000Z',
        payload: {
          type: 'function_call',
          name: 'exec_command',
          arguments: '{"cmd":"pnpm test"}',
          call_id: 'call-ordered-1',
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-18T22:11:03.000Z',
        payload: {
          type: 'function_call_output',
          call_id: 'call-ordered-1',
          output: '{"metadata":{"exit_code":0}}',
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-18T22:11:04.000Z',
        payload: {
          type: 'reasoning',
          summary: [{ text: 'Inspecting the output' }],
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-18T22:11:05.000Z',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Checks completed.' }],
        },
      },
    ];

    const builder = new CodexChunkBuilder();
    const chunks = builder.buildChunks(entries);

    expect(chunks).toHaveLength(2);
    expect(chunks[0].type).toBe('user');

    if (chunks[1].type !== 'ai') {
      throw new Error('Expected AI chunk');
    }

    expect(chunks[1].sections?.map((section) => section.type)).toEqual([
      'message',
      'tool_executions',
      'reasoning',
      'message',
    ]);
  });

  it('does not duplicate tool execution sections when output arrives after reasoning', () => {
    const entries: CodexLogEntry[] = [
      {
        type: 'response_item',
        timestamp: '2026-02-18T22:12:00.000Z',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'run another check' }],
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-18T22:12:01.000Z',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Running checks.' }],
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-18T22:12:02.000Z',
        payload: {
          type: 'function_call',
          name: 'exec_command',
          arguments: '{"cmd":"pnpm test"}',
          call_id: 'call-ordered-2',
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-18T22:12:03.000Z',
        payload: {
          type: 'reasoning',
          summary: [{ text: 'Inspecting output before final response' }],
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-18T22:12:04.000Z',
        payload: {
          type: 'function_call_output',
          call_id: 'call-ordered-2',
          output: '{"metadata":{"exit_code":0}}',
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-18T22:12:05.000Z',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Checks complete.' }],
        },
      },
    ];

    const builder = new CodexChunkBuilder();
    const chunks = builder.buildChunks(entries);

    expect(chunks).toHaveLength(2);
    expect(chunks[0].type).toBe('user');

    if (chunks[1].type !== 'ai') {
      throw new Error('Expected AI chunk');
    }

    expect(chunks[1].sections?.map((section) => section.type)).toEqual([
      'message',
      'tool_executions',
      'reasoning',
      'message',
    ]);

    const toolSections = (chunks[1].sections ?? []).filter((section) => section.type === 'tool_executions');
    expect(toolSections).toHaveLength(1);
    if (toolSections[0]?.type !== 'tool_executions') {
      throw new Error('Expected tool_executions section');
    }

    expect(toolSections[0].executions).toHaveLength(1);
    expect(toolSections[0].executions[0]?.functionCall.callId).toBe('call-ordered-2');
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
    expect(chunks[0].type).toBe('user');
    if (chunks[0].type !== 'user') {
      throw new Error('Expected user chunk');
    }

    expect(chunks[0].content).toBe('[Image #1]\n\nwhy the model in sidebar is unknown?');
    expect(chunks[0].timestamp).toBe('2026-02-19T07:50:08.225Z');
    expect(chunks[0].attachments).toHaveLength(1);
    expect(chunks[0].attachments?.[0]).toMatchObject({
      source: 'response_item',
      mimeType: 'image/png',
      kind: 'image',
      previewable: true,
    });
    expect(chunks[0].attachments?.[0]?.dataUrl?.startsWith('data:image/png;base64,')).toBe(true);

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
    expect(chunks[0].type).toBe('user');
    if (chunks[0].type !== 'user') {
      throw new Error('Expected user chunk');
    }

    expect(chunks[0].content).toBe('check git diff and review code\n[Image #1]');
    expect(chunks[0].timestamp).toBe('2026-02-18T22:39:16.888Z');
    expect(chunks[0].attachments).toHaveLength(1);
    expect(chunks[0].attachments?.[0]).toMatchObject({
      kind: 'image',
      previewable: true,
    });

    if (chunks[1].type !== 'ai') {
      throw new Error('Expected AI chunk');
    }

    expect(chunks[1].textBlocks).toEqual(['Starting review.']);
  });

  it('classifies base64 attachment previews by MIME, size, and binary status', () => {
    const oversizedBase64 = 'A'.repeat(2_900_000);
    const entries: CodexLogEntry[] = [
      {
        type: 'response_item',
        timestamp: '2026-02-20T01:00:00.000Z',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: 'inspect attachments' },
            { type: 'input_image', image_url: 'data:text/plain;base64,aGVsbG8gd29ybGQ=' },
            { type: 'input_image', image_url: 'data:application/json;base64,eyJhIjoxfQ==' },
            { type: 'input_image', image_url: 'data:application/octet-stream;base64,AQID' },
            { type: 'input_image', image_url: `data:image/png;base64,${oversizedBase64}` },
          ],
        },
      },
      {
        type: 'event_msg',
        timestamp: '2026-02-20T01:00:01.000Z',
        payload: {
          type: 'agent_message',
          message: 'done',
        },
      },
    ];

    const builder = new CodexChunkBuilder();
    const chunks = builder.buildChunks(entries);

    expect(chunks[0]?.type).toBe('user');
    if (chunks[0]?.type !== 'user') {
      throw new Error('Expected user chunk');
    }

    expect(chunks[0].attachments).toHaveLength(4);
    const attachments = chunks[0].attachments ?? [];

    expect(attachments[0]).toMatchObject({
      mimeType: 'text/plain',
      kind: 'text',
      previewable: true,
      textContent: 'hello world',
    });

    expect(attachments[1]).toMatchObject({
      mimeType: 'application/json',
      kind: 'code',
      previewable: true,
    });
    expect(attachments[1]?.textContent).toContain('"a":1');

    expect(attachments[2]).toMatchObject({
      mimeType: 'application/octet-stream',
      kind: 'binary',
      previewable: false,
      previewReason: 'binary',
    });

    expect(attachments[3]).toMatchObject({
      mimeType: 'image/png',
      kind: 'image',
      previewable: false,
      previewReason: 'too_large',
    });
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
    expect(chunks[2].previousReasoningEffort).toBe('unknown');
    expect(chunks[2].model).toBe('gpt-5.3-codex');
    expect(chunks[2].reasoningEffort).toBe('unknown');
    expect(chunks[2].timestamp).toBe('2026-02-18T22:30:03.000Z');
  });

  it('inserts a collaboration mode change divider when turn_context mode changes', () => {
    const entries: CodexLogEntry[] = [
      {
        type: 'turn_context',
        timestamp: '2026-02-18T23:10:00.000Z',
        payload: {
          cwd: '/repo/project-a',
          model: 'gpt-5.3-codex',
          collaboration_mode: { mode: 'default' },
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-18T23:10:01.000Z',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'first prompt' }],
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-18T23:10:02.000Z',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'first response' }],
        },
      },
      {
        type: 'turn_context',
        timestamp: '2026-02-18T23:10:03.000Z',
        payload: {
          cwd: '/repo/project-a',
          model: 'gpt-5.3-codex',
          collaboration_mode: { mode: 'collaborator' },
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-18T23:10:04.000Z',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'second prompt' }],
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-18T23:10:05.000Z',
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
    expect(chunks[2].type).toBe('collaboration_mode_change');
    expect(chunks[3].type).toBe('user');
    expect(chunks[4].type).toBe('ai');

    if (chunks[2].type !== 'collaboration_mode_change') {
      throw new Error('Expected collaboration_mode_change chunk');
    }

    expect(chunks[2].previousMode).toBe('default');
    expect(chunks[2].mode).toBe('collaborator');
    expect(chunks[2].timestamp).toBe('2026-02-18T23:10:03.000Z');
  });

  it('inserts one compaction divider when compaction lifecycle events are adjacent', () => {
    const entries: CodexLogEntry[] = [
      {
        type: 'response_item',
        timestamp: '2026-02-19T10:08:50.000Z',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'before compaction' }],
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-19T10:08:51.000Z',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Working...' }],
        },
      },
      {
        type: 'compacted',
        timestamp: '2026-02-19T10:08:56.993Z',
        payload: {
          message: '',
          replacement_history: [],
        },
      },
      {
        type: 'compaction',
        timestamp: '2026-02-19T10:08:56.994Z',
        encrypted_content: 'gAAAAA',
      },
      {
        type: 'event_msg',
        timestamp: '2026-02-19T10:08:56.995Z',
        payload: {
          type: 'context_compacted',
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-19T10:08:58.000Z',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'after compaction' }],
        },
      },
      {
        type: 'event_msg',
        timestamp: '2026-02-19T10:08:59.000Z',
        payload: {
          type: 'agent_message',
          message: 'Continuing with less context.',
        },
      },
    ];

    const builder = new CodexChunkBuilder();
    const chunks = builder.buildChunks(entries);

    expect(chunks).toHaveLength(5);
    expect(chunks[0].type).toBe('user');
    expect(chunks[1].type).toBe('ai');
    expect(chunks[2].type).toBe('compaction');
    expect(chunks[3].type).toBe('user');
    expect(chunks[4].type).toBe('ai');
    expect(chunks.filter((chunk) => chunk.type === 'compaction')).toHaveLength(1);
  });

  it('converts Codex bootstrap prelude user messages into system chunks', () => {
    const entries: CodexLogEntry[] = [
      {
        type: 'response_item',
        timestamp: '2026-02-19T11:00:00.000Z',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: '# AGENTS.md instructions for /repo\n\n<INSTRUCTIONS>\nuse the skill\n</INSTRUCTIONS>',
            },
          ],
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-19T11:00:01.000Z',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: '<environment_context>\n  <cwd>/repo</cwd>\n  <shell>zsh</shell>\n</environment_context>',
            },
          ],
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-19T11:00:02.000Z',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: '<permissions instructions>\nfilesystem sandboxing applies\n</permissions instructions>',
            },
          ],
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-19T11:00:02.500Z',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: '<collaboration_mode># Collaboration Mode: Default\n</collaboration_mode>',
            },
          ],
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-19T11:00:02.750Z',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: '<turn_aborted> The user interrupted the previous turn on purpose. </turn_aborted>',
            },
          ],
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-19T11:00:03.000Z',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'show actual user prompt in sidebar' }],
        },
      },
      {
        type: 'event_msg',
        timestamp: '2026-02-19T11:00:04.000Z',
        payload: {
          type: 'agent_message',
          message: 'Working on it.',
        },
      },
    ];

    const builder = new CodexChunkBuilder();
    const chunks = builder.buildChunks(entries);

    expect(chunks).toHaveLength(7);
    expect(chunks[0].type).toBe('system');
    expect(chunks[1].type).toBe('system');
    expect(chunks[2].type).toBe('system');
    expect(chunks[3].type).toBe('system');
    expect(chunks[4].type).toBe('system');
    if (chunks[4].type !== 'system') {
      throw new Error('Expected system chunk');
    }

    expect(chunks[4].content).toContain('<turn_aborted>');
    expect(chunks[5]).toEqual({
      type: 'user',
      content: 'show actual user prompt in sidebar',
      timestamp: '2026-02-19T11:00:03.000Z',
    });

    if (chunks[6].type !== 'ai') {
      throw new Error('Expected AI chunk');
    }

    expect(chunks[6].textBlocks).toEqual(['Working on it.']);
  });
});
