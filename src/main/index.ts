import { app, BrowserWindow, ipcMain } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { initializeIpcHandlers, removeIpcHandlers } from './ipc/handlers';
import { CodexServiceContext } from './services/infrastructure';

import { IPC_CHANNELS } from '@preload/constants/channels';
import { createLogger } from '@shared/utils/logger';

const logger = createLogger('Main');
const APP_DISPLAY_NAME = 'codex-devtools';

let mainWindow: BrowserWindow | null = null;
let serviceContext: CodexServiceContext | null = null;
let removeFileChangeListener: (() => void) | null = null;

function resolveAppIconPath(): string | undefined {
  const candidates = [
    join(process.cwd(), 'resources/logo.png'),
    join(process.cwd(), 'resources/icon.png'),
    join(__dirname, '../../resources/logo.png'),
    join(__dirname, '../../resources/icon.png'),
    join(process.resourcesPath, 'resources/logo.png'),
    join(process.resourcesPath, 'resources/icon.png'),
  ];

  return candidates.find((candidate) => existsSync(candidate));
}

function getRendererIndexPath(): string {
  const candidates = [
    join(__dirname, '../../out/renderer/index.html'),
    join(__dirname, '../renderer/index.html'),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

const createWindow = (): BrowserWindow => {
  const iconPath = resolveAppIconPath();
  const window = new BrowserWindow({
    title: APP_DISPLAY_NAME,
    width: 1200,
    height: 800,
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(getRendererIndexPath());
  }

  return window;
};

function wireFileWatcherEvents(): void {
  if (!serviceContext) {
    return;
  }

  if (removeFileChangeListener) {
    removeFileChangeListener();
    removeFileChangeListener = null;
  }

  removeFileChangeListener = serviceContext.onFileChange((event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.EVENTS_FILE_CHANGE, event);
    }
  });
}

function initializeServices(): void {
  serviceContext = new CodexServiceContext({
    sessionsPath: process.env.CODEX_SESSIONS_PATH,
  });

  serviceContext.start();
  wireFileWatcherEvents();
  initializeIpcHandlers(serviceContext, ipcMain, { getVersion: () => app.getVersion() });
}

function disposeServices(): void {
  if (removeFileChangeListener) {
    removeFileChangeListener();
    removeFileChangeListener = null;
  }

  removeIpcHandlers(ipcMain);

  if (serviceContext) {
    serviceContext.dispose();
    serviceContext = null;
  }
}

app.setName(APP_DISPLAY_NAME);
process.title = APP_DISPLAY_NAME;

void app.whenReady().then(() => {
  const iconPath = resolveAppIconPath();
  if (iconPath && process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(iconPath);
  }

  initializeServices();
  mainWindow = createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
      wireFileWatcherEvents();
    }
  });
});

app.on('before-quit', () => {
  disposeServices();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection in main process', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception in main process', error);
});
