import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { CodexSessionScanner } from '../../src/main/services/discovery/CodexSessionScanner';

function writeSessionFile(
  root: string,
  datePath: string,
  fileName: string,
  timestamp: string,
  cwd: string,
  includePrelude = false,
  firstModel = 'gpt-5',
  firstEffort = 'high',
  sessionMetaModel?: string,
): string {
  const dir = path.join(root, datePath);
  mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, fileName);

  const firstLine = {
    type: 'session_meta',
    timestamp,
    payload: {
      id: 'session-1',
      cwd,
      originator: 'codex_cli_rs',
      cli_version: '1.0.0',
      model_provider: 'openai',
      model: sessionMetaModel,
      base_instructions: { text: 'base' },
      git: {
        commit_hash: 'abc123',
        branch: 'main',
        repository_url: 'https://example.com/repo.git',
      },
    },
  };

  const turnContextLine = {
    type: 'turn_context',
    timestamp: '2026-02-18T22:00:01.000Z',
    payload: {
      cwd,
      model: firstModel,
      effort: firstEffort,
    },
  };

  const lines: unknown[] = includePrelude
    ? [
        {
          type: 'event_msg',
          timestamp: '2026-02-18T21:59:59.000Z',
          payload: {
            type: 'token_count',
            info: null,
            rate_limits: null,
          },
        },
        firstLine,
        turnContextLine,
      ]
    : [firstLine, turnContextLine];

  writeFileSync(filePath, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`, 'utf8');
  return filePath;
}

describe('CodexSessionScanner', () => {
  it('scans rollout files and groups sessions by cwd', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'codex-scan-test-'));
    writeSessionFile(
      root,
      '2026/02/18',
      'rollout-2026-02-18T22-00-00-session-1.jsonl',
      '2026-02-18T22:00:00.000Z',
      '/repo/project-a',
      true,
      'gpt-5',
      'high',
      'gpt-4.1-mini',
    );

    const scanner = new CodexSessionScanner(root);
    const sessions = await scanner.scanSessions();
    const projects = await scanner.scanProjects();

    expect(sessions).toHaveLength(1);
    expect(sessions[0].cwd).toBe('/repo/project-a');
    expect(sessions[0].model).toBe('gpt-5');
    expect(sessions[0].modelUsages).toEqual([{ model: 'gpt-5', reasoningEffort: 'high' }]);
    expect(projects).toHaveLength(1);
    expect(projects[0].sessionCount).toBe(1);
    expect(projects[0].name).toBe('project-a');

    const filtered = await scanner.scanSessions({
      startDate: new Date('2026-02-19T00:00:00.000Z'),
    });
    expect(filtered).toHaveLength(0);

    rmSync(root, { recursive: true, force: true });
  });
});
