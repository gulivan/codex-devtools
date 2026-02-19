import { IPC_CHANNELS } from '@preload/constants/channels';
import { createLogger } from '@shared/utils/logger';

import type { CodexServiceContext } from '@main/services/infrastructure';
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

  logger.info('Session handlers registered');
}

export function removeSessionHandlers(ipcMain: IpcMain): void {
  ipcMain.removeHandler(IPC_CHANNELS.SESSIONS_GET_PROJECTS);
  ipcMain.removeHandler(IPC_CHANNELS.SESSIONS_GET_SESSIONS);
  ipcMain.removeHandler(IPC_CHANNELS.SESSIONS_GET_DETAIL);
  ipcMain.removeHandler(IPC_CHANNELS.SESSIONS_GET_CHUNKS);

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
