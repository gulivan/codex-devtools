import { createAppStore, initializeEventListeners } from '@renderer/store';

import type { RendererApi } from '@renderer/api';
import type { CodexDevToolsConfig } from '@main/services/infrastructure';
import type { CodexChunk, CodexProject, CodexSearchSessionsResult, CodexSession } from '@main/types';

function createConfig(theme: 'system' | 'dark' | 'light' = 'dark'): CodexDevToolsConfig {
  return {
    general: {
      launchAtLogin: false,
      showDockIcon: true,
      codexSessionsPath: '/tmp/sessions',
    },
    display: {
      showReasoning: true,
      showTokenCounts: true,
      showDeveloperMessages: false,
      showAttachmentPreviews: true,
      theme,
    },
    httpServer: {
      enabled: false,
      port: 3456,
    },
  };
}

function createApiMock(): RendererApi {
  const projects: CodexProject[] = [
    {
      cwd: '/repo/a',
      name: 'a',
      sessionCount: 2,
      lastActivity: '2026-02-18T00:00:00.000Z',
    },
  ];

  const sessions: CodexSession[] = [
    {
      id: 'session-1',
      filePath: '/tmp/s-1.jsonl',
      cwd: '/repo/a',
      model: 'gpt-5',
      modelUsages: [{ model: 'gpt-5', reasoningEffort: 'high' }],
      cliVersion: '0.1.0',
      gitBranch: 'main',
      gitCommit: 'abc123',
      startTime: '2026-02-18T01:00:00.000Z',
      modelProvider: 'openai',
    },
  ];

  const chunks: CodexChunk[] = [
    {
      type: 'user',
      content: 'Investigate failing tests in CI',
      timestamp: '2026-02-18T01:00:02.000Z',
    },
    {
      type: 'ai',
      textBlocks: ['I found the failure in snapshot assertions.'],
      toolExecutions: [],
      reasoning: [],
      metrics: { totalTokens: 42, outputTokens: 20 },
      timestamp: '2026-02-18T01:00:05.000Z',
      duration: 2_000,
    },
  ];

  const emptySearch: CodexSearchSessionsResult = {
    query: '',
    totalMatches: 0,
    sessionsSearched: 1,
    results: [],
  };

  return {
    getProjects: vi.fn(async () => projects),
    getSessions: vi.fn(async () => sessions),
    getSessionDetail: vi.fn(async () => null),
    getSessionChunks: vi.fn(async () => chunks),
    searchSessions: vi.fn(async () => emptySearch),
    getConfig: vi.fn(async () => createConfig()),
    updateConfig: vi.fn(async (_key, value) => createConfig((value as { theme?: 'system' | 'dark' | 'light' }).theme ?? 'dark')),
    getAppVersion: vi.fn(async () => '0.1.0'),
    onFileChange: vi.fn(() => () => undefined),
  };
}

describe('renderer store', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fetches projects and sessions and opens a session tab', async () => {
    const api = createApiMock();
    const store = createAppStore(api);

    await store.getState().fetchProjects();
    expect(store.getState().projects).toHaveLength(1);

    await store.getState().selectProject('/repo/a');
    expect(store.getState().sessions).toHaveLength(1);

    await store.getState().selectSession('session-1');

    expect(store.getState().activeSessionId).toBe('session-1');
    expect(store.getState().openTabs.some((tab) => tab.type === 'session' && tab.sessionId === 'session-1')).toBe(true);
    expect(store.getState().chunks).toHaveLength(2);
  });

  it('builds session previews from the first non-bootstrap user message', async () => {
    const api = createApiMock();
    const previewChunks: CodexChunk[] = [
      {
        type: 'user',
        content: '# AGENTS.md instructions for /repo/a\n\n<INSTRUCTIONS>\ninternal\n</INSTRUCTIONS>',
        timestamp: '2026-02-18T01:00:00.100Z',
      },
      {
        type: 'user',
        content:
          '<environment_context>\n  <cwd>/repo/a</cwd>\n  <shell>zsh</shell>\n</environment_context>',
        timestamp: '2026-02-18T01:00:00.200Z',
      },
      {
        type: 'user',
        content:
          '<permissions instructions>\nsandbox_mode is workspace-write\n</permissions instructions>',
        timestamp: '2026-02-18T01:00:00.250Z',
      },
      {
        type: 'user',
        content: '<collaboration_mode># Collaboration Mode: Default\n</collaboration_mode>',
        timestamp: '2026-02-18T01:00:00.275Z',
      },
      {
        type: 'user',
        content: 'show real prompt title in sidebar',
        timestamp: '2026-02-18T01:00:00.300Z',
      },
    ];
    api.getSessionChunks = vi.fn(async () => previewChunks);

    const store = createAppStore(api);
    await store.getState().fetchSessions('/repo/a');
    await Promise.resolve();
    await Promise.resolve();

    expect(store.getState().sessionPreviews['session-1']).toBe('show real prompt title in sidebar');
  });

  it('uses dark theme before config is fetched', () => {
    const api = createApiMock();
    const store = createAppStore(api);

    expect(store.getState().theme).toBe('dark');
  });

  it('logs preview prefetch errors without failing session fetch', async () => {
    const api = createApiMock();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    api.getSessionChunks = vi.fn(async () => {
      throw new Error('preview load failed');
    });

    const store = createAppStore(api);
    await store.getState().fetchSessions('/repo/a');
    await Promise.resolve();
    await Promise.resolve();

    expect(store.getState().sessions).toHaveLength(1);
    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.mock.calls[0]?.[0]).toBe('[Store:sessionSlice]');
    expect(errorSpy.mock.calls[0]?.[1]).toBe('Failed to prefetch session previews');
  });

  it('refreshes state when file-change listener fires', async () => {
    vi.useFakeTimers();

    const api = createApiMock();
    let fileChangeListener: (() => void) | undefined;

    api.onFileChange = vi.fn((callback) => {
      fileChangeListener = () => {
        callback({
          filePath: '/tmp/s-1.jsonl',
          eventType: 'changed',
          timestamp: '2026-02-18T01:20:00.000Z',
        });
      };
      return () => {
        fileChangeListener = undefined;
      };
    });

    const store = createAppStore(api);
    await store.getState().selectProject('/repo/a');
    await store.getState().selectSession('session-1');

    const cleanup = initializeEventListeners(store, api);
    fileChangeListener?.();

    vi.advanceTimersByTime(150);
    await Promise.resolve();
    await Promise.resolve();

    expect(api.getProjects).toHaveBeenCalled();
    expect(api.getSessions).toHaveBeenCalled();
    expect(api.getSessionChunks).toHaveBeenCalled();

    cleanup();
  });
});
