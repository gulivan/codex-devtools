import { IPC_CHANNELS } from '@preload/constants/channels';
import { createLogger } from '@shared/utils/logger';

import { checkForAppUpdate } from '../services/infrastructure/AppUpdateChecker';

import type { CodexAppUpdateStatus } from '@main/types';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';

const logger = createLogger('IPC:utility');

let getAppVersion: () => string = () => '0.0.0';
let getAppUpdateStatus: () => Promise<CodexAppUpdateStatus> = () =>
  checkForAppUpdate({ currentVersion: getAppVersion() });

interface UtilityHandlerOptions {
  getVersion?: () => string;
  getAppUpdateStatus?: () => Promise<CodexAppUpdateStatus>;
}

export function initializeUtilityHandlers(options: UtilityHandlerOptions = {}): void {
  if (options.getVersion) {
    getAppVersion = options.getVersion;
  }

  if (options.getAppUpdateStatus) {
    getAppUpdateStatus = options.getAppUpdateStatus;
  }
}

export function registerUtilityHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IPC_CHANNELS.UTILITY_GET_APP_VERSION, handleGetAppVersion);
  ipcMain.handle(IPC_CHANNELS.UTILITY_CHECK_APP_UPDATE, handleCheckAppUpdate);
  logger.info('Utility handlers registered');
}

export function removeUtilityHandlers(ipcMain: IpcMain): void {
  ipcMain.removeHandler(IPC_CHANNELS.UTILITY_GET_APP_VERSION);
  ipcMain.removeHandler(IPC_CHANNELS.UTILITY_CHECK_APP_UPDATE);
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

async function handleCheckAppUpdate(_event: IpcMainInvokeEvent): Promise<CodexAppUpdateStatus> {
  try {
    return await getAppUpdateStatus();
  } catch (error) {
    logger.error('Error in check-app-update', error);
    let fallbackVersion = '0.0.0';
    try {
      fallbackVersion = getAppVersion();
    } catch {
      fallbackVersion = '0.0.0';
    }

    return {
      currentVersion: fallbackVersion,
      latestVersion: null,
      updateAvailable: false,
      releaseUrl: null,
      checkedAt: new Date().toISOString(),
      source: 'github',
      error: 'Failed to check for updates.',
    };
  }
}
