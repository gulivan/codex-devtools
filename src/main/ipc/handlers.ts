import { createLogger } from '@shared/utils/logger';

import { initializeConfigHandlers, registerConfigHandlers, removeConfigHandlers } from './config';
import { initializeSearchHandlers, registerSearchHandlers, removeSearchHandlers } from './search';
import { initializeSessionHandlers, registerSessionHandlers, removeSessionHandlers } from './sessions';
import {
  initializeUtilityHandlers,
  registerUtilityHandlers,
  removeUtilityHandlers,
} from './utility';

import type { CodexServiceContext } from '@main/services/infrastructure';
import type { IpcMain } from 'electron';

const logger = createLogger('IPC:handlers');

export interface IpcInitializationOptions {
  getVersion?: () => string;
}

export const initializeIpcHandlers = (
  serviceContext: CodexServiceContext,
  targetIpcMain: IpcMain,
  options: IpcInitializationOptions = {},
): void => {
  initializeSessionHandlers(serviceContext);
  initializeSearchHandlers(serviceContext);
  initializeConfigHandlers(serviceContext);
  initializeUtilityHandlers({ getVersion: options.getVersion });

  registerSessionHandlers(targetIpcMain);
  registerSearchHandlers(targetIpcMain);
  registerConfigHandlers(targetIpcMain);
  registerUtilityHandlers(targetIpcMain);

  logger.info('All handlers registered');
};

export const removeIpcHandlers = (targetIpcMain: IpcMain): void => {
  removeSessionHandlers(targetIpcMain);
  removeSearchHandlers(targetIpcMain);
  removeConfigHandlers(targetIpcMain);
  removeUtilityHandlers(targetIpcMain);

  logger.info('All handlers removed');
};
