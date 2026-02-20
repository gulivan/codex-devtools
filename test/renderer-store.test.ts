import { createAppStore, initializeEventListeners } from '@renderer/store';

import type { RendererApi } from '@renderer/api';
import type { CodexDevToolsConfig } from '@main/services/infrastructure';
import type {
  CodexChunk,
  CodexProject,
  CodexSearchSessionsResult,
  CodexSession,
  CodexStatsSummary,
} from '@main/types';

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
      fileSizeBytes: 1_000,
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

  const emptyStats: CodexStatsSummary = {
    generatedAt: '2026-02-18T00:00:00.000Z',
    timezone: 'UTC',
    scope: { type: 'all' },
    totals: {
      sessions: 1,
      archivedSessions: 0,
      eventCount: 2,
      durationMs: 2_000,
      estimatedCostUsd: 0,
      totalTokens: 42,
      inputTokens: 20,
      outputTokens: 22,
      cachedTokens: 0,
      reasoningTokens: 0,
    },
    daily: [],
    hourly: [],
    topDays: [],
    topHours: [],
    models: [],
    reasoningEfforts: [],
    costCoverage: {
      pricedTokens: 0,
      unpricedTokens: 42,
      unpricedModels: ['gpt-5'],
    },
    rates: {
      updatedAt: null,
      source: null,
    },
  };

  return {
    getProjects: vi.fn(async () => projects),
    getSessions: vi.fn(async () => sessions),
    getSessionDetail: vi.fn(async () => null),
    getSessionChunks: vi.fn(async () => chunks),
    getStats: vi.fn(async () => emptyStats),
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
    await store.getState().fetchSessions('/repo/a', { prefetchPreviews: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(store.getState().sessionPreviews['session-1']).toBe('show real prompt title in sidebar');
  });

  it('does not prefetch session previews by default in web mode', async () => {
    const api = createApiMock();
    const store = createAppStore(api);

    await store.getState().fetchSessions('/repo/a');

    expect(api.getSessionChunks).not.toHaveBeenCalled();
    expect(store.getState().sessionPreviews).toEqual({});
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
    await store.getState().fetchSessions('/repo/a', { prefetchPreviews: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(store.getState().sessions).toHaveLength(1);
    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.mock.calls[0]?.[0]).toBe('[Store:sessionSlice]');
    expect(errorSpy.mock.calls[0]?.[1]).toBe('Failed to prefetch session previews');
  });

  it('marks sidebar badge when session file size grows between refreshes', async () => {
    const api = createApiMock();
    let sizeBytes = 1_000;
    api.getSessions = vi.fn(async () => [
      {
        id: 'session-1',
        filePath: '/tmp/s-1.jsonl',
        fileSizeBytes: sizeBytes,
        cwd: '/repo/a',
        model: 'gpt-5',
        modelUsages: [{ model: 'gpt-5', reasoningEffort: 'high' }],
        cliVersion: '0.1.0',
        gitBranch: 'main',
        gitCommit: 'abc123',
        startTime: '2026-02-18T01:00:00.000Z',
        modelProvider: 'openai',
      },
    ]);

    const store = createAppStore(api);
    await store.getState().fetchSessions('/repo/a', { prefetchPreviews: false });
    expect(store.getState().sessionUpdateBadges['session-1']).toBeUndefined();

    sizeBytes = 2_200;
    await store.getState().fetchSessions('/repo/a', { prefetchPreviews: false });
    expect(store.getState().sessionUpdateBadges['session-1']).toBe(true);
  });

  it('keeps sidebar stable during background session refresh', async () => {
    const api = createApiMock();
    const store = createAppStore(api);

    expect(store.getState().sessionsLoading).toBe(false);
    await store.getState().fetchSessions('/repo/a', { prefetchPreviews: false, background: true });
    expect(store.getState().sessionsLoading).toBe(false);
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
    expect(store.getState().sessionUpdateBadges['session-1']).toBe(true);

    cleanup();
  });

  it('marks updated sessions in sidebar state and clears badge on open', async () => {
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

    const cleanup = initializeEventListeners(store, api);
    fileChangeListener?.();

    vi.advanceTimersByTime(150);
    await Promise.resolve();
    await Promise.resolve();

    expect(store.getState().sessionUpdateBadges['session-1']).toBe(true);

    await store.getState().selectSession('session-1');
    expect(store.getState().sessionUpdateBadges['session-1']).toBeUndefined();

    cleanup();
  });

  it('matches updated sessions by filename when watcher path format differs', async () => {
    const api = createApiMock();
    const store = createAppStore(api);
    await store.getState().selectProject('/repo/a');

    store.getState().markSessionUpdatedByPath('/Users/ivan/.codex/sessions/2026/02/19/s-1.jsonl');
    expect(store.getState().sessionUpdateBadges['session-1']).toBe(true);
  });

  it('does not match by filename when multiple sessions share the same basename', async () => {
    const api = createApiMock();
    api.getSessions = vi.fn(async () => [
      {
        id: 'session-1',
        filePath: '/tmp/a/rollout-shared.jsonl',
        fileSizeBytes: 1_000,
        cwd: '/repo/a',
        model: 'gpt-5',
        modelUsages: [{ model: 'gpt-5', reasoningEffort: 'high' }],
        cliVersion: '0.1.0',
        gitBranch: 'main',
        gitCommit: 'abc123',
        startTime: '2026-02-18T01:00:00.000Z',
        modelProvider: 'openai',
      },
      {
        id: 'session-2',
        filePath: '/tmp/b/rollout-shared.jsonl',
        fileSizeBytes: 1_100,
        cwd: '/repo/a',
        model: 'gpt-5',
        modelUsages: [{ model: 'gpt-5', reasoningEffort: 'high' }],
        cliVersion: '0.1.0',
        gitBranch: 'main',
        gitCommit: 'def456',
        startTime: '2026-02-18T02:00:00.000Z',
        modelProvider: 'openai',
      },
    ]);

    const store = createAppStore(api);
    await store.getState().fetchSessions('/repo/a', { prefetchPreviews: false });

    store.getState().markSessionUpdatedByPath('/Users/ivan/.codex/sessions/2026/02/19/rollout-shared.jsonl');
    expect(store.getState().sessionUpdateBadges['session-1']).toBeUndefined();
    expect(store.getState().sessionUpdateBadges['session-2']).toBeUndefined();
  });

  it('polls for updates as a fallback when file-change events are missed', async () => {
    vi.useFakeTimers();

    const api = createApiMock();
    const store = createAppStore(api);
    await store.getState().selectProject('/repo/a');
    await store.getState().selectSession('session-1');

    vi.mocked(api.getSessions).mockClear();
    vi.mocked(api.getSessionChunks).mockClear();

    const cleanup = initializeEventListeners(store, api);

    vi.advanceTimersToNextTimer();
    await Promise.resolve();
    await Promise.resolve();

    expect(api.getSessions).toHaveBeenCalled();
    expect(api.getSessionChunks).toHaveBeenCalled();

    cleanup();
  });
});
