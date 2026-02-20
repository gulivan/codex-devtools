import { IPC_CHANNELS } from '@preload/constants/channels';
import { createLogger } from '@shared/utils/logger';

import type { CodexServiceContext } from '@main/services/infrastructure';
import type { CodexStatsScope } from '@main/types';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';

const logger = createLogger('IPC:sessions');

let serviceContext: CodexServiceContext;

export function initializeSessionHandlers(context: CodexServiceContext): void {
  serviceContext = context;
}

export function registerSessionHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IPC_CHANNELS.SESSIONS_GET_PROJECTS, handleGetProjects);
  ipcMain.handle(IPC_CHANNELS.SESSIONS_GET_SESSIONS, handleGetSessions);
  ipcMain.handle(IPC_CHANNELS.SESSIONS_GET_DETAIL, handleGetSessionDetail);
  ipcMain.handle(IPC_CHANNELS.SESSIONS_GET_CHUNKS, handleGetSessionChunks);
  ipcMain.handle(IPC_CHANNELS.SESSIONS_GET_STATS, handleGetSessionStats);

  logger.info('Session handlers registered');
}

export function removeSessionHandlers(ipcMain: IpcMain): void {
  ipcMain.removeHandler(IPC_CHANNELS.SESSIONS_GET_PROJECTS);
  ipcMain.removeHandler(IPC_CHANNELS.SESSIONS_GET_SESSIONS);
  ipcMain.removeHandler(IPC_CHANNELS.SESSIONS_GET_DETAIL);
  ipcMain.removeHandler(IPC_CHANNELS.SESSIONS_GET_CHUNKS);
  ipcMain.removeHandler(IPC_CHANNELS.SESSIONS_GET_STATS);

  logger.info('Session handlers removed');
}

async function handleGetProjects(_event: IpcMainInvokeEvent) {
  try {
    return await serviceContext.getProjects();
  } catch (error) {
    logger.error('Error in get-projects', error);
    return [];
  }
}

async function handleGetSessions(_event: IpcMainInvokeEvent, projectCwd: string) {
  try {
    return await serviceContext.getSessions(projectCwd);
  } catch (error) {
    logger.error(`Error in get-sessions for ${projectCwd}`, error);
    return [];
  }
}

async function handleGetSessionDetail(_event: IpcMainInvokeEvent, sessionId: string) {
  try {
    return await serviceContext.getSessionDetail(sessionId);
  } catch (error) {
    logger.error(`Error in get-session-detail for ${sessionId}`, error);
    return null;
  }
}

async function handleGetSessionChunks(_event: IpcMainInvokeEvent, sessionId: string) {
  try {
    return await serviceContext.getSessionChunks(sessionId);
  } catch (error) {
    logger.error(`Error in get-session-chunks for ${sessionId}`, error);
    return null;
  }
}

async function handleGetSessionStats(
  _event: IpcMainInvokeEvent,
  scope?: CodexStatsScope,
) {
  try {
    return await serviceContext.getStats(scope);
  } catch (error) {
    logger.error('Error in get-session-stats', error);
    return {
      generatedAt: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local',
      scope: { type: 'all' } as CodexStatsScope,
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
    };
  }
}
