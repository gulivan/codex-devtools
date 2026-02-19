import type { CodexDevToolsConfig } from '../src/main/services/infrastructure/ConfigManager';

import type { RendererApi } from '@renderer/api';

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
      theme,
    },
    httpServer: {
      enabled: false,
      port: 3456,
    },
  };
}

describe('renderer api adapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).window;
  });

  it('uses preload API when running in Electron mode', async () => {
    const getProjects = vi.fn().mockResolvedValue([]);
    const preloadApi: RendererApi = {
      getProjects,
      getSessions: vi.fn(),
      getSessionDetail: vi.fn(),
      getSessionChunks: vi.fn(),
      searchSessions: vi.fn(),
      getConfig: vi.fn(),
      updateConfig: vi.fn(),
      getAppVersion: vi.fn(),
      onFileChange: vi.fn(() => () => undefined),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = {
      codexDevtools: preloadApi,
      location: { origin: 'http://127.0.0.1:3456', search: '' },
    };

    const { api, isElectronMode } = await import('@renderer/api');

    expect(isElectronMode()).toBe(true);
    await api.getProjects();
    expect(getProjects).toHaveBeenCalledTimes(1);
  });

  it('falls back to HTTP endpoints in standalone mode', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/projects')) {
        return new Response(JSON.stringify([{ cwd: '/repo', name: 'repo', sessionCount: 1, lastActivity: '2026-01-01T00:00:00.000Z' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/config') && init?.method === 'PUT') {
        return new Response(JSON.stringify(createConfig('light')), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unhandled URL in test: ${url}`);
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = {
      location: { origin: 'http://127.0.0.1:3456', search: '' },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = fetchMock;

    const { api, isElectronMode } = await import('@renderer/api');

    expect(isElectronMode()).toBe(false);

    const projects = await api.getProjects();
    expect(projects).toHaveLength(1);

    await api.updateConfig('display', { theme: 'light' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3456/config',
      expect.objectContaining({ method: 'PUT' }),
    );
  });
});
