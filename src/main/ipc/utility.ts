import { IPC_CHANNELS } from '@preload/constants/channels';
import { createLogger } from '@shared/utils/logger';

import type { IpcMain, IpcMainInvokeEvent } from 'electron';

const logger = createLogger('IPC:utility');

let getAppVersion: () => string = () => '0.0.0';

export function initializeUtilityHandlers(options: { getVersion?: () => string } = {}): void {
  if (options.getVersion) {
    getAppVersion = options.getVersion;
  }
}

export function registerUtilityHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IPC_CHANNELS.UTILITY_GET_APP_VERSION, handleGetAppVersion);
  logger.info('Utility handlers registered');
}

export function removeUtilityHandlers(ipcMain: IpcMain): void {
  ipcMain.removeHandler(IPC_CHANNELS.UTILITY_GET_APP_VERSION);
  logger.info('Utility handlers removed');
}

function handleGetAppVersion(_event: IpcMainInvokeEvent): string {
  try {
    return getAppVersion();
  } catch (error) {
    logger.error('Error in get-app-version', error);
    return '0.0.0';
  }
}
