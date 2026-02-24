import { vi } from 'vitest';

import type { CodexDevtoolsRpc } from '@shared/rpc';

type BunRequests = CodexDevtoolsRpc['bun']['requests'];
type BunRequestHandlers = {
  [K in keyof BunRequests]: (params: BunRequests[K]['params']) => Promise<BunRequests[K]['response']>;
};

describe('bun rpc bridge', () => {
  let requestHandlers: BunRequestHandlers | null = null;
  let sendFileChangeMock: ReturnType<typeof vi.fn>;
  let serviceContextMock: {
    start: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    onFileChange: ReturnType<typeof vi.fn>;
    getProjects: ReturnType<typeof vi.fn>;
    getSessions: ReturnType<typeof vi.fn>;
    getSessionDetail: ReturnType<typeof vi.fn>;
    getSessionChunks: ReturnType<typeof vi.fn>;
    getStats: ReturnType<typeof vi.fn>;
    searchSessions: ReturnType<typeof vi.fn>;
    getConfig: ReturnType<typeof vi.fn>;
    updateConfig: ReturnType<typeof vi.fn>;
  };
  let checkForAppUpdateMock: ReturnType<typeof vi.fn>;
  let readVersionMock: ReturnType<typeof vi.fn>;
  let createDefaultConfigMock: ReturnType<typeof vi.fn>;

  const loadModule = async (): Promise<BunRequestHandlers> => {
    await import('../src/bun/index');
    if (!requestHandlers) {
      throw new Error('Expected Bun RPC handlers to be registered');
    }

    return requestHandlers;
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();

    requestHandlers = null;
    sendFileChangeMock = vi.fn();
    checkForAppUpdateMock = vi.fn();
    readVersionMock = vi.fn(() => '0.1.0');
    createDefaultConfigMock = vi.fn(() => ({
      general: {
        launchAtLogin: false,
        showDockIcon: true,
      },
      display: {
        showReasoning: true,
        showTokenCounts: true,
        showDeveloperMessages: false,
        showAttachmentPreviews: true,
        theme: 'dark',
      },
      httpServer: {
        enabled: false,
        port: 3456,
      },
    }));

    serviceContextMock = {
      start: vi.fn(),
      dispose: vi.fn(),
      onFileChange: vi.fn(() => () => undefined),
      getProjects: vi.fn(async () => []),
      getSessions: vi.fn(async () => []),
      getSessionDetail: vi.fn(async () => null),
      getSessionChunks: vi.fn(async () => null),
      getStats: vi.fn(async () => ({
        generatedAt: '2026-02-20T00:00:00.000Z',
        timezone: 'UTC',
        scope: { type: 'all' as const },
        totals: {
          sessions: 1,
          archivedSessions: 0,
          eventCount: 0,
          durationMs: 0,
          estimatedCostUsd: 0,
          totalTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
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
          unpricedTokens: 0,
          unpricedModels: [],
        },
        rates: {
          updatedAt: null,
          source: null,
        },
      })),
      searchSessions: vi.fn(async () => ({ query: '', totalMatches: 0, sessionsSearched: 0, results: [] })),
      getConfig: vi.fn(async () => createDefaultConfigMock()),
      updateConfig: vi.fn(async () => null),
    };

    vi.doMock('electrobun/bun', () => {
      const defineRPC = vi.fn((config: { handlers: { requests?: unknown } }) => {
        requestHandlers = config.handlers.requests as BunRequestHandlers;
        return {
          send: {
            fileChange: sendFileChangeMock,
          },
        };
      });

      class BrowserWindow {
        constructor(_options?: unknown) {}
        show(): void {}
        focus(): void {}
        on(_name: string, _handler: (event: unknown) => void): void {}
      }

      return {
        BrowserView: {
          defineRPC,
        },
        BrowserWindow,
        default: {
          events: {
            on: vi.fn(),
          },
        },
      };
    });

    vi.doMock('@main/services/infrastructure/CodexServiceContext', () => ({
      CodexServiceContext: class {
        constructor(_options?: unknown) {
          return serviceContextMock;
        }
      },
    }));

    vi.doMock('@main/services/infrastructure/AppUpdateChecker', () => ({
      checkForAppUpdate: checkForAppUpdateMock,
    }));

    vi.doMock('@main/http/utility', () => ({
      readVersionFromPackageJson: readVersionMock,
    }));

    vi.doMock('@main/services/infrastructure/ConfigManager', () => ({
      createDefaultCodexDevToolsConfig: createDefaultConfigMock,
    }));

    vi.doMock('@shared/utils/logger', () => ({
      createLogger: () => ({
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
      }),
    }));
  });

  afterEach(() => {
    vi.resetModules();
    vi.unmock('electrobun/bun');
    vi.unmock('@main/services/infrastructure/CodexServiceContext');
    vi.unmock('@main/services/infrastructure/AppUpdateChecker');
    vi.unmock('@main/http/utility');
    vi.unmock('@main/services/infrastructure/ConfigManager');
    vi.unmock('@shared/utils/logger');
  });

  it('delegates request handlers to the service context', async () => {
    serviceContextMock.getProjects.mockResolvedValueOnce([
      { cwd: '/repo', name: 'repo', sessionCount: 1, lastActivity: null },
    ]);

    const handlers = await loadModule();
    const projects = await handlers.getProjects({});

    expect(serviceContextMock.start).toHaveBeenCalledTimes(1);
    expect(serviceContextMock.getProjects).toHaveBeenCalledTimes(1);
    expect(projects).toEqual([{ cwd: '/repo', name: 'repo', sessionCount: 1, lastActivity: null }]);
  });

  it('forwards file change events to webview rpc channel', async () => {
    await loadModule();

    expect(serviceContextMock.onFileChange).toHaveBeenCalledTimes(1);
    const listener = serviceContextMock.onFileChange.mock.calls[0]?.[0] as ((event: unknown) => void) | undefined;
    expect(listener).toBeTypeOf('function');

    const payload = { type: 'modified', filePath: '/tmp/session.jsonl' };
    listener?.(payload);

    expect(sendFileChangeMock).toHaveBeenCalledWith(payload);
  });

  it('returns fallback payloads when dependencies fail', async () => {
    serviceContextMock.getStats.mockRejectedValueOnce(new Error('stats failed'));
    serviceContextMock.getConfig.mockRejectedValueOnce(new Error('config failed'));
    checkForAppUpdateMock.mockRejectedValueOnce(new Error('network failed'));

    const handlers = await loadModule();

    const stats = await handlers.getStats({ scope: { type: 'project', cwd: '/repo' } });
    expect(stats.totals.sessions).toBe(0);
    expect(stats.scope).toEqual({ type: 'project', cwd: '/repo' });

    const config = await handlers.getConfig({});
    expect(createDefaultConfigMock).toHaveBeenCalled();
    expect(config.display.theme).toBe('dark');

    const appUpdate = await handlers.checkAppUpdate({});
    expect(readVersionMock).toHaveBeenCalled();
    expect(appUpdate.currentVersion).toBe('0.1.0');
    expect(appUpdate.updateAvailable).toBe(false);
    expect(appUpdate.error).toBe('Failed to check for updates.');
  });
});
