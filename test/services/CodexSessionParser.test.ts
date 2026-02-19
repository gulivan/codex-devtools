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
});
