import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { CodexSessionParser } from '../../src/main/services/parsing/CodexSessionParser';

function createTempSessionFile(lines: unknown[]): { dir: string; filePath: string } {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'codex-parser-test-'));
  const filePath = path.join(dir, 'rollout-2026-02-18T22-00-00-test.jsonl');
  writeFileSync(filePath, lines.map((line) => JSON.stringify(line)).join('\n'), 'utf8');
  return { dir, filePath };
}

describe('CodexSessionParser', () => {
  it('parses session metadata and token metrics from JSONL', async () => {
    const timestamp = '2026-02-18T22:00:00.000Z';
    const { dir, filePath } = createTempSessionFile([
      {
        type: 'session_meta',
        timestamp,
        payload: {
          id: 'session-1',
          cwd: '/repo/project-a',
          originator: 'codex_cli_rs',
          cli_version: '1.0.0',
          model_provider: 'openai',
          base_instructions: { text: 'base' },
          git: {
            commit_hash: 'abc123',
            branch: 'main',
            repository_url: 'https://example.com/repo.git',
          },
        },
      },
      {
        type: 'turn_context',
        timestamp: '2026-02-18T22:00:01.000Z',
        payload: {
          cwd: '/repo/project-a',
          approval_policy: 'never',
          sandbox_policy: { type: 'danger-full-access' },
          model: 'gpt-5',
          personality: 'friendly',
          collaboration_mode: { mode: 'default' },
          effort: 'high',
          truncation_policy: { mode: 'tokens', limit: 10_000 },
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-18T22:00:02.000Z',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'hello' }],
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-18T22:00:03.000Z',
        payload: {
          type: 'function_call',
          name: 'shell_command',
          arguments: '{"cmd":"echo hi"}',
          call_id: 'call-1',
        },
      },
      {
        type: 'event_msg',
        timestamp: '2026-02-18T22:00:04.000Z',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: 10,
              cached_input_tokens: 2,
              output_tokens: 6,
              reasoning_output_tokens: 1,
              total_tokens: 19,
            },
            last_token_usage: {
              input_tokens: 10,
              cached_input_tokens: 2,
              output_tokens: 6,
              reasoning_output_tokens: 1,
              total_tokens: 19,
            },
            model_context_window: 200_000,
          },
          rate_limits: null,
        },
      },
    ]);

    const parser = new CodexSessionParser();
    const parsed = await parser.parseSessionFile(filePath);

    expect(parsed.session.id).toBe('session-1');
    expect(parsed.session.cwd).toBe('/repo/project-a');
    expect(parsed.session.model).toBe('gpt-5');
    expect(parsed.session.modelUsages).toEqual([{ model: 'gpt-5', reasoningEffort: 'high' }]);
    expect(parsed.sessionMeta).not.toBeNull();
    expect(parsed.metrics.inputTokens).toBe(10);
    expect(parsed.metrics.cachedTokens).toBe(2);
    expect(parsed.metrics.outputTokens).toBe(6);
    expect(parsed.metrics.reasoningTokens).toBe(1);
    expect(parsed.metrics.totalTokens).toBe(19);
    expect(parsed.metrics.toolCallCount).toBe(1);
    expect(parsed.metrics.turnCount).toBe(1);
    expect(parsed.responseItems).toHaveLength(2);

    rmSync(dir, { recursive: true, force: true });
  });

  it('accepts reasoning summary objects and input_image content blocks', async () => {
    const { dir, filePath } = createTempSessionFile([
      {
        type: 'session_meta',
        timestamp: '2026-02-18T22:00:00.000Z',
        payload: {
          id: 'session-2',
          cwd: '/repo/project-b',
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-18T22:00:01.000Z',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_image',
              image_url: 'data:image/png;base64,abc',
            },
            {
              type: 'input_text',
              text: 'describe this screenshot',
            },
          ],
        },
      },
      {
        type: 'response_item',
        timestamp: '2026-02-18T22:00:02.000Z',
        payload: {
          type: 'reasoning',
          summary: [{ type: 'summary_text', text: 'planned steps' }],
          encrypted_content: 'encrypted',
        },
      },
    ]);

    const parser = new CodexSessionParser();
    const parsed = await parser.parseSessionFile(filePath);

    expect(parsed.session.id).toBe('session-2');
    expect(parsed.session.modelUsages).toEqual([]);
    expect(parsed.responseItems).toHaveLength(2);
    expect(parsed.classifiedEntries.some((entry) => entry.kind === 'user')).toBe(true);
    expect(parsed.classifiedEntries.some((entry) => entry.kind === 'reasoning')).toBe(true);

    rmSync(dir, { recursive: true, force: true });
  });

  it('deduplicates repeated token_count events with identical cumulative totals', async () => {
    const { dir, filePath } = createTempSessionFile([
      {
        type: 'session_meta',
        timestamp: '2026-02-18T22:00:00.000Z',
        payload: {
          id: 'session-dedupe',
          cwd: '/repo/project-dedupe',
        },
      },
      {
        type: 'event_msg',
        timestamp: '2026-02-18T22:00:01.000Z',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: 100,
              cached_input_tokens: 80,
              output_tokens: 10,
              reasoning_output_tokens: 4,
              total_tokens: 110,
            },
            last_token_usage: {
              input_tokens: 100,
              cached_input_tokens: 80,
              output_tokens: 10,
              reasoning_output_tokens: 4,
              total_tokens: 110,
            },
            model_context_window: 200_000,
          },
          rate_limits: null,
        },
      },
      {
        type: 'event_msg',
        timestamp: '2026-02-18T22:00:02.000Z',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: 100,
              cached_input_tokens: 80,
              output_tokens: 10,
              reasoning_output_tokens: 4,
              total_tokens: 110,
            },
            last_token_usage: {
              input_tokens: 100,
              cached_input_tokens: 80,
              output_tokens: 10,
              reasoning_output_tokens: 4,
              total_tokens: 110,
            },
            model_context_window: 200_000,
          },
          rate_limits: null,
        },
      },
      {
        type: 'event_msg',
        timestamp: '2026-02-18T22:00:03.000Z',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: 145,
              cached_input_tokens: 105,
              output_tokens: 18,
              reasoning_output_tokens: 9,
              total_tokens: 163,
            },
            last_token_usage: {
              input_tokens: 45,
              cached_input_tokens: 25,
              output_tokens: 8,
              reasoning_output_tokens: 5,
              total_tokens: 53,
            },
            model_context_window: 200_000,
          },
          rate_limits: null,
        },
      },
    ]);

    const parser = new CodexSessionParser();
    const parsed = await parser.parseSessionFile(filePath);

    expect(parsed.metrics.inputTokens).toBe(145);
    expect(parsed.metrics.cachedTokens).toBe(105);
    expect(parsed.metrics.outputTokens).toBe(18);
    expect(parsed.metrics.reasoningTokens).toBe(9);
    expect(parsed.metrics.totalTokens).toBe(163);

    rmSync(dir, { recursive: true, force: true });
  });

  it('parses compacted/compaction entries and context_compacted event messages', async () => {
    const { dir, filePath } = createTempSessionFile([
      {
        type: 'session_meta',
        timestamp: '2026-02-19T10:08:40.000Z',
        payload: {
          id: 'session-compaction',
          cwd: '/repo/project-c',
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
    ]);

    const parser = new CodexSessionParser();
    const parsed = await parser.parseSessionFile(filePath);

    expect(parsed.entries.some((entry) => entry.type === 'compacted')).toBe(true);
    expect(parsed.entries.some((entry) => entry.type === 'compaction')).toBe(true);
    expect(parsed.eventMessages.some((entry) => entry.payload.type === 'context_compacted')).toBe(true);

    rmSync(dir, { recursive: true, force: true });
  });
});
