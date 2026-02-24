import Electrobun, { BrowserView, BrowserWindow } from 'electrobun/bun';

import { readVersionFromPackageJson } from '@main/http/utility';
import { checkForAppUpdate } from '@main/services/infrastructure/AppUpdateChecker';
import { CodexServiceContext } from '@main/services/infrastructure/CodexServiceContext';
import { createDefaultCodexDevToolsConfig } from '@main/services/infrastructure/ConfigManager';
import { createLogger } from '@shared/utils/logger';

import type { CodexDevtoolsRpc } from '@shared/rpc';
import type { CodexStatsScope, CodexStatsSummary } from '@main/types';

const logger = createLogger('BunMain');
const APP_DISPLAY_NAME = 'codex-devtools';

let mainWindow: BrowserWindow | null = null;
let serviceContext: CodexServiceContext | null = null;
let removeFileChangeListener: (() => void) | null = null;
let disposed = false;

const createStatsFallback = (scope?: CodexStatsScope): CodexStatsSummary => ({
  generatedAt: new Date().toISOString(),
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local',
  scope: scope ?? ({ type: 'all' } as CodexStatsScope),
  totals: {
    sessions: 0,
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
});

const rpc = BrowserView.defineRPC<CodexDevtoolsRpc>({
  handlers: {
    requests: {
      getProjects: async () => {
        try {
          return await serviceContext?.getProjects() ?? [];
        } catch (error) {
          logger.error('Error in getProjects', error);
          return [];
        }
      },
      getSessions: async ({ projectCwd }) => {
        try {
          return await serviceContext?.getSessions(projectCwd) ?? [];
        } catch (error) {
          logger.error(`Error in getSessions for ${projectCwd}`, error);
          return [];
        }
      },
      getSessionDetail: async ({ sessionId }) => {
        try {
          return await serviceContext?.getSessionDetail(sessionId) ?? null;
        } catch (error) {
          logger.error(`Error in getSessionDetail for ${sessionId}`, error);
          return null;
        }
      },
      getSessionChunks: async ({ sessionId }) => {
        try {
          return await serviceContext?.getSessionChunks(sessionId) ?? null;
        } catch (error) {
          logger.error(`Error in getSessionChunks for ${sessionId}`, error);
          return null;
        }
      },
      getStats: async ({ scope }) => {
        try {
          return await serviceContext?.getStats(scope) ?? createStatsFallback(scope);
        } catch (error) {
          logger.error('Error in getStats', error);
          return createStatsFallback(scope);
        }
      },
      searchSessions: async ({ query }) => {
        try {
          return await serviceContext?.searchSessions(query) ?? {
            query,
            totalMatches: 0,
            sessionsSearched: 0,
            results: [],
          };
        } catch (error) {
          logger.error('Error in searchSessions', error);
          return {
            query,
            totalMatches: 0,
            sessionsSearched: 0,
            results: [],
          };
        }
      },
      getConfig: async () => {
        const fallbackConfig = createDefaultCodexDevToolsConfig();
        try {
          return await serviceContext?.getConfig() ?? fallbackConfig;
        } catch (error) {
          logger.error('Error in getConfig', error);
          return fallbackConfig;
        }
      },
      updateConfig: async ({ key, value }) => {
        try {
          return serviceContext?.updateConfig(key, value) ?? null;
        } catch (error) {
          logger.error(`Error in updateConfig for key ${String(key)}`, error);
          return null;
        }
      },
      getAppVersion: async () => {
        try {
          return readVersionFromPackageJson();
        } catch (error) {
          logger.error('Error in getAppVersion', error);
          return '0.0.0';
        }
      },
      checkAppUpdate: async () => {
        const currentVersion = readVersionFromPackageJson();
        try {
          return await checkForAppUpdate({ currentVersion });
        } catch (error) {
          logger.error('Error in checkAppUpdate', error);
          return {
            currentVersion,
            latestVersion: null,
            updateAvailable: false,
            releaseUrl: null,
            checkedAt: new Date().toISOString(),
            source: 'github',
            error: 'Failed to check for updates.',
          };
        }
      },
    },
  },
});

const resolveMainViewUrl = (): string => {
  const explicitUrl = process.env.ELECTROBUN_RENDERER_URL ?? process.env.VITE_DEV_SERVER_URL ?? '';
  if (explicitUrl.trim().length > 0) {
    return explicitUrl;
  }

  return 'views://mainview/index.html';
};

const createMainWindow = (): BrowserWindow =>
  new BrowserWindow({
    title: APP_DISPLAY_NAME,
    frame: {
      x: 64,
      y: 64,
      width: 1200,
      height: 800,
    },
    url: resolveMainViewUrl(),
    renderer: process.platform === 'linux' ? 'cef' : 'native',
    titleBarStyle: 'default',
    rpc,
  });

const wireFileWatcherEvents = (): void => {
  if (!serviceContext) {
    return;
  }

  if (removeFileChangeListener) {
    removeFileChangeListener();
    removeFileChangeListener = null;
  }

  removeFileChangeListener = serviceContext.onFileChange((event) => {
    try {
      rpc.send.fileChange(event);
    } catch (error) {
      logger.warn('Failed to dispatch file-change event to webview', error);
    }
  });
};

const initializeServices = (): void => {
  serviceContext = new CodexServiceContext({
    sessionsPath: process.env.CODEX_SESSIONS_PATH,
  });

  serviceContext.start();
  wireFileWatcherEvents();
};

const disposeServices = (): void => {
  if (disposed) {
    return;
  }

  disposed = true;

  if (removeFileChangeListener) {
    removeFileChangeListener();
    removeFileChangeListener = null;
  }

  if (serviceContext) {
    serviceContext.dispose();
    serviceContext = null;
  }
};

const bootstrap = (): void => {
  initializeServices();
  mainWindow = createMainWindow();
  try {
    mainWindow.show();
    mainWindow.focus();
  } catch (error) {
    logger.warn('Failed to focus main window during bootstrap', error);
  }
  mainWindow.on('close', () => {
    mainWindow = null;
  });
};

Electrobun.events.on('before-quit', () => {
  disposeServices();
});

process.on('exit', () => {
  disposeServices();
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection in bun process', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception in bun process', error);
});

bootstrap();
