import { IPC_CHANNELS } from '@preload/constants/channels';
import { createLogger } from '@shared/utils/logger';

import type { CodexServiceContext } from '@main/services/infrastructure';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';

const logger = createLogger('IPC:search');

let serviceContext: CodexServiceContext;

export function initializeSearchHandlers(context: CodexServiceContext): void {
  serviceContext = context;
}

export function registerSearchHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IPC_CHANNELS.SEARCH_SESSIONS, handleSearchSessions);
  logger.info('Search handlers registered');
}

export function removeSearchHandlers(ipcMain: IpcMain): void {
  ipcMain.removeHandler(IPC_CHANNELS.SEARCH_SESSIONS);
  logger.info('Search handlers removed');
}

async function handleSearchSessions(_event: IpcMainInvokeEvent, query: string) {
  try {
    return await serviceContext.searchSessions(query);
  } catch (error) {
    logger.error('Error in search-sessions', error);
    return {
      query,
      totalMatches: 0,
      sessionsSearched: 0,
      results: [],
    };
  }
}
