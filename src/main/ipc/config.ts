import { IPC_CHANNELS } from '@preload/constants/channels';
import { createLogger } from '@shared/utils/logger';

import type { CodexServiceContext, CodexDevToolsConfig } from '@main/services/infrastructure';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';

const logger = createLogger('IPC:config');

let serviceContext: CodexServiceContext;

export function initializeConfigHandlers(context: CodexServiceContext): void {
  serviceContext = context;
}

export function registerConfigHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, handleGetConfig);
  ipcMain.handle(IPC_CHANNELS.CONFIG_UPDATE, handleUpdateConfig);
  logger.info('Config handlers registered');
}

export function removeConfigHandlers(ipcMain: IpcMain): void {
  ipcMain.removeHandler(IPC_CHANNELS.CONFIG_GET);
  ipcMain.removeHandler(IPC_CHANNELS.CONFIG_UPDATE);
  logger.info('Config handlers removed');
}

async function handleGetConfig(_event: IpcMainInvokeEvent): Promise<CodexDevToolsConfig> {
  return serviceContext.getConfig();
}

async function handleUpdateConfig(
  _event: IpcMainInvokeEvent,
  key: keyof CodexDevToolsConfig,
  value: unknown,
): Promise<CodexDevToolsConfig | null> {
  try {
    return serviceContext.updateConfig(key, value);
  } catch (error) {
    logger.error(`Error in config:update for key ${String(key)}`, error);
    return null;
  }
}
