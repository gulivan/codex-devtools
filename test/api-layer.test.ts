import Fastify from 'fastify';
import { appendFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { registerHttpRoutes } from '../src/main/http';
import { initializeIpcHandlers, removeIpcHandlers } from '../src/main/ipc/handlers';
import { createStandaloneServer } from '../src/main/standalone';
import { CodexServiceContext, type CodexDevToolsConfig } from '../src/main/services/infrastructure';
import { IPC_CHANNELS } from '../src/preload/constants/channels';

interface SessionFixtureInput {
  id: string;
  cwd: string;
  userMessage: string;
  assistantMessage: string;
  filePath: string;
}

class IpcMainMock {
  private readonly handlers = new Map<string, (...args: unknown[]) => unknown>();

  handle(channel: string, handler: (...args: unknown[]) => unknown): void {
    this.handlers.set(channel, handler);
  }

  removeHandler(channel: string): void {
    this.handlers.delete(channel);
  }

  async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    const handler = this.handlers.get(channel);
    if (!handler) {
      throw new Error(`Handler not found for channel: ${channel}`);
    }

    return handler({} as never, ...args);
  }

  size(): number {
    return this.handlers.size;
  }
}

function writeSessionFixture(input: SessionFixtureInput): void {
  const entries = [
    {
      type: 'session_meta',
      timestamp: '2026-02-18T21:00:00.000Z',
      payload: {
        id: input.id,
        cwd: input.cwd,
        originator: 'codex-cli',
        cli_version: '0.94.0',
        model_provider: 'openai',
        base_instructions: { text: 'helpful' },
        git: {
          commit_hash: 'deadbeef',
          branch: 'main',
          repository_url: 'https://example.com/repo.git',
        },
      },
    },
    {
      type: 'turn_context',
      timestamp: '2026-02-18T21:00:01.000Z',
        payload: {
          cwd: input.cwd,
          approval_policy: 'never',
          sandbox_policy: { type: 'workspace-write' },
          model: 'gpt-5',
          personality: 'default',
          collaboration_mode: { mode: 'default' },
          effort: 'high',
          truncation_policy: { mode: 'tokens', limit: 10_000 },
        },
      },
    {
      type: 'response_item',
      timestamp: '2026-02-18T21:00:02.000Z',
      payload: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: input.userMessage }],
      },
    },
    {
      type: 'response_item',
      timestamp: '2026-02-18T21:00:03.000Z',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: input.assistantMessage }],
      },
    },
    {
      type: 'response_item',
      timestamp: '2026-02-18T21:00:04.000Z',
      payload: {
        type: 'function_call',
        name: 'shell_command',
        arguments: '{"command":"pwd"}',
        call_id: `${input.id}-tool-1`,
      },
    },
    {
      type: 'response_item',
      timestamp: '2026-02-18T21:00:05.000Z',
      payload: {
        type: 'function_call_output',
        call_id: `${input.id}-tool-1`,
        output: '{"exit_code":0,"stdout":"/tmp"}',
      },
    },
    {
      type: 'event_msg',
      timestamp: '2026-02-18T21:00:06.000Z',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: 10,
            cached_input_tokens: 0,
            output_tokens: 5,
            reasoning_output_tokens: 1,
            total_tokens: 16,
          },
          last_token_usage: {
            input_tokens: 10,
            cached_input_tokens: 0,
            output_tokens: 5,
            reasoning_output_tokens: 1,
            total_tokens: 16,
          },
          model_context_window: 200000,
        },
        rate_limits: null,
      },
    },
  ];

  mkdirSync(path.dirname(input.filePath), { recursive: true });
  writeFileSync(input.filePath, `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`, 'utf8');
}

describe('api layer', () => {
  let tempDir: string;
  let sessionsRoot: string;
  let configPath: string;
  let serviceContext: CodexServiceContext;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'codex-api-test-'));
    sessionsRoot = path.join(tempDir, 'sessions');
    configPath = path.join(tempDir, 'config.json');

    writeSessionFixture({
      id: 'session-1',
      cwd: '/workspace/app-a',
      userMessage: 'Investigate login failure',
      assistantMessage: 'I will inspect the auth logs.',
      filePath: path.join(sessionsRoot, '2026', '02', '18', 'rollout-session-1.jsonl'),
    });

    writeSessionFixture({
      id: 'session-2',
      cwd: '/workspace/app-a',
      userMessage: 'Optimize query performance',
      assistantMessage: 'I found a missing index.',
      filePath: path.join(sessionsRoot, '2026', '02', '19', 'rollout-session-2.jsonl'),
    });

    writeSessionFixture({
      id: 'session-3',
      cwd: '/workspace/app-b',
      userMessage: 'Add dark mode toggle',
      assistantMessage: 'I added a theme preference.',
      filePath: path.join(sessionsRoot, '2026', '02', '20', 'rollout-session-3.jsonl'),
    });

    serviceContext = new CodexServiceContext({ sessionsPath: sessionsRoot, configPath });
  });

  afterEach(() => {
    serviceContext.dispose();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns projects, sessions, details, chunks, and search results', async () => {
    const projects = await serviceContext.getProjects();
    expect(projects).toHaveLength(2);

    const appA = projects.find((project) => project.cwd === '/workspace/app-a');
    expect(appA?.sessionCount).toBe(2);

    const appASessions = await serviceContext.getSessions('/workspace/app-a');
    expect(appASessions).toHaveLength(2);

    const detail = await serviceContext.getSessionDetail('session-1');
    expect(detail?.session.id).toBe('session-1');
    expect(detail?.metrics.totalTokens).toBeGreaterThan(0);

    const chunks = await serviceContext.getSessionChunks('session-1');
    expect(chunks).not.toBeNull();
    expect(chunks?.some((chunk) => chunk.type === 'user')).toBe(true);
    expect(chunks?.some((chunk) => chunk.type === 'ai')).toBe(true);

    const searchResult = await serviceContext.searchSessions('login');
    expect(searchResult.totalMatches).toBeGreaterThan(0);
    expect(searchResult.results[0]?.sessionId).toBe('session-1');
  });

  it('refreshes chunks when the session file changes even without watcher invalidation', async () => {
    const filePath = path.join(sessionsRoot, '2026', '02', '18', 'rollout-session-1.jsonl');
    const initialChunks = await serviceContext.getSessionChunks('session-1');
    expect(initialChunks).not.toBeNull();

    appendFileSync(
      filePath,
      `${JSON.stringify({
        type: 'response_item',
        timestamp: '2026-02-18T21:00:07.000Z',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Follow-up status update.' }],
        },
      })}\n`,
      'utf8',
    );

    const refreshedChunks = await serviceContext.getSessionChunks('session-1');
    expect(refreshedChunks).not.toBeNull();
    expect(
      refreshedChunks?.some(
        (chunk) =>
          chunk.type === 'ai' && chunk.textBlocks.some((text) => text.includes('Follow-up status update.')),
      ),
    ).toBe(true);
  });

  it('keeps deleted sessions in stats as archived rows', async () => {
    const initialStats = await serviceContext.getStats({ type: 'all' });
    expect(initialStats.totals.sessions).toBe(3);
    expect(initialStats.totals.archivedSessions).toBe(0);

    rmSync(path.join(sessionsRoot, '2026', '02', '18', 'rollout-session-1.jsonl'), { force: true });
    serviceContext.dataCache.clear();

    const refreshedStats = await serviceContext.getStats({ type: 'all' });
    expect(refreshedStats.totals.sessions).toBe(3);
    expect(refreshedStats.totals.archivedSessions).toBe(1);
  });

  it('does not overcount duplicate token_count events in stats totals', async () => {
    const filePath = path.join(sessionsRoot, '2026', '02', '18', 'rollout-session-1.jsonl');
    appendFileSync(
      filePath,
      `${JSON.stringify({
        type: 'event_msg',
        timestamp: '2026-02-18T21:00:06.500Z',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: 10,
              cached_input_tokens: 0,
              output_tokens: 5,
              reasoning_output_tokens: 1,
              total_tokens: 16,
            },
            last_token_usage: {
              input_tokens: 10,
              cached_input_tokens: 0,
              output_tokens: 5,
              reasoning_output_tokens: 1,
              total_tokens: 16,
            },
            model_context_window: 200000,
          },
          rate_limits: null,
        },
      })}\n`,
      'utf8',
    );

    serviceContext.dataCache.clear();
    const stats = await serviceContext.getStats({ type: 'all' });

    expect(stats.totals.totalTokens).toBe(48);
    expect(stats.totals.inputTokens).toBe(30);
    expect(stats.totals.outputTokens).toBe(15);
  });

  it('refreshes stats after session changes without manual cache clear', async () => {
    const initialStats = await serviceContext.getStats({ type: 'all' });

    const filePath = path.join(sessionsRoot, '2026', '02', '18', 'rollout-session-1.jsonl');
    appendFileSync(
      filePath,
      `${JSON.stringify({
        type: 'event_msg',
        timestamp: '2026-02-18T21:00:06.900Z',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: 15,
              cached_input_tokens: 0,
              output_tokens: 7,
              reasoning_output_tokens: 2,
              total_tokens: 22,
            },
            last_token_usage: {
              input_tokens: 5,
              cached_input_tokens: 0,
              output_tokens: 2,
              reasoning_output_tokens: 1,
              total_tokens: 6,
            },
            model_context_window: 200000,
          },
          rate_limits: null,
        },
      })}\n`,
      'utf8',
    );

    const refreshedStats = await serviceContext.getStats({ type: 'all' });
    expect(refreshedStats.totals.totalTokens).toBe(initialStats.totals.totalTokens + 6);
    expect(refreshedStats.totals.inputTokens).toBe(initialStats.totals.inputTokens + 5);
    expect(refreshedStats.totals.outputTokens).toBe(initialStats.totals.outputTokens + 2);
  });

  it('deduplicates reasoning effort session counts across model switches in one session', async () => {
    const filePath = path.join(sessionsRoot, '2026', '02', '18', 'rollout-session-1.jsonl');
    appendFileSync(
      filePath,
      `${JSON.stringify({
        type: 'turn_context',
        timestamp: '2026-02-18T21:00:06.100Z',
        payload: {
          cwd: '/workspace/app-a',
          model: 'gpt-5-mini',
          effort: 'high',
        },
      })}\n`,
      'utf8',
    );
    appendFileSync(
      filePath,
      `${JSON.stringify({
        type: 'event_msg',
        timestamp: '2026-02-18T21:00:06.200Z',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: 12,
              cached_input_tokens: 0,
              output_tokens: 7,
              reasoning_output_tokens: 1,
              total_tokens: 19,
            },
            last_token_usage: {
              input_tokens: 2,
              cached_input_tokens: 0,
              output_tokens: 2,
              reasoning_output_tokens: 0,
              total_tokens: 3,
            },
            model_context_window: 200000,
          },
          rate_limits: null,
        },
      })}\n`,
      'utf8',
    );

    const stats = await serviceContext.getStats({ type: 'all' });
    const highEffort = stats.reasoningEfforts.find((item) => item.reasoningEffort === 'high');

    expect(highEffort).toBeDefined();
    expect(highEffort?.sessionCount).toBe(3);
  });

  it('updates config by section key', () => {
    const updated = serviceContext.updateConfig('display', { theme: 'dark' });
    expect(updated?.display.theme).toBe('dark');

    const invalid = serviceContext.updateConfig('display', 'invalid');
    expect(invalid).toBeNull();
  });

  it('serves mirrored HTTP routes', async () => {
    const app = Fastify();
    registerHttpRoutes(app, {
      serviceContext,
      getVersion: () => '9.9.9',
    });

    const projectsResponse = await app.inject({ method: 'GET', url: '/projects' });
    expect(projectsResponse.statusCode).toBe(200);
    expect(JSON.parse(projectsResponse.body)).toHaveLength(2);

    const sessionsResponse = await app.inject({
      method: 'GET',
      url: `/projects/${encodeURIComponent('/workspace/app-a')}/sessions`,
    });
    expect(sessionsResponse.statusCode).toBe(200);
    expect(JSON.parse(sessionsResponse.body)).toHaveLength(2);

    const detailResponse = await app.inject({ method: 'GET', url: '/sessions/session-1' });
    expect(detailResponse.statusCode).toBe(200);
    expect(JSON.parse(detailResponse.body)?.session?.id).toBe('session-1');

    const chunksResponse = await app.inject({ method: 'GET', url: '/sessions/session-1/chunks' });
    expect(chunksResponse.statusCode).toBe(200);
    expect(JSON.parse(chunksResponse.body)).toBeInstanceOf(Array);

    const statsResponse = await app.inject({ method: 'GET', url: '/stats?scope=all' });
    expect(statsResponse.statusCode).toBe(200);
    expect(JSON.parse(statsResponse.body)?.totals?.sessions).toBeGreaterThan(0);

    const searchResponse = await app.inject({ method: 'GET', url: '/search?q=login' });
    expect(searchResponse.statusCode).toBe(200);
    expect(JSON.parse(searchResponse.body).totalMatches).toBeGreaterThan(0);

    const configResponse = await app.inject({ method: 'GET', url: '/config' });
    expect(configResponse.statusCode).toBe(200);
    const config = JSON.parse(configResponse.body) as CodexDevToolsConfig;
    expect(config.general.launchAtLogin).toBe(false);

    const updateConfigResponse = await app.inject({
      method: 'PUT',
      url: '/config',
      payload: {
        key: 'display',
        value: { showReasoning: false },
      },
    });
    expect(updateConfigResponse.statusCode).toBe(200);
    expect(JSON.parse(updateConfigResponse.body)?.display?.showReasoning).toBe(false);

    const versionResponse = await app.inject({ method: 'GET', url: '/version' });
    expect(versionResponse.statusCode).toBe(200);
    expect(versionResponse.body).toBe('9.9.9');

    await app.close();
  });

  it('registers and removes IPC handlers', async () => {
    const ipcMainMock = new IpcMainMock();

    initializeIpcHandlers(serviceContext, ipcMainMock as never, { getVersion: () => '1.2.3' });

    const projects = (await ipcMainMock.invoke(IPC_CHANNELS.SESSIONS_GET_PROJECTS)) as unknown[];
    expect(projects).toHaveLength(2);

    const sessions = (await ipcMainMock.invoke(
      IPC_CHANNELS.SESSIONS_GET_SESSIONS,
      '/workspace/app-a',
    )) as unknown[];
    expect(sessions).toHaveLength(2);

    const detail = (await ipcMainMock.invoke(
      IPC_CHANNELS.SESSIONS_GET_DETAIL,
      'session-1',
    )) as { session?: { id?: string } } | null;
    expect(detail?.session?.id).toBe('session-1');

    const search = (await ipcMainMock.invoke(IPC_CHANNELS.SEARCH_SESSIONS, 'login')) as {
      totalMatches: number;
    };
    expect(search.totalMatches).toBeGreaterThan(0);

    const stats = (await ipcMainMock.invoke(IPC_CHANNELS.SESSIONS_GET_STATS, { type: 'all' })) as {
      totals: { sessions: number };
    };
    expect(stats.totals.sessions).toBeGreaterThan(0);

    const version = await ipcMainMock.invoke(IPC_CHANNELS.UTILITY_GET_APP_VERSION);
    expect(version).toBe('1.2.3');

    removeIpcHandlers(ipcMainMock as never);
    expect(ipcMainMock.size()).toBe(0);
  });

  it('creates standalone server and serves /version', async () => {
    const standalone = await createStandaloneServer({
      sessionsPath: sessionsRoot,
      configPath,
    });

    const versionResponse = await standalone.app.inject({ method: 'GET', url: '/version' });
    expect(versionResponse.statusCode).toBe(200);
    expect(versionResponse.body.length).toBeGreaterThan(0);

    await standalone.app.close();
  });
});
