import { ipcRenderer, type IpcRenderer, type IpcRendererEvent } from 'electron';

import { IPC_CHANNELS } from './constants/channels';

import type { CodexDevToolsConfig, CodexFileChangeEvent } from '@main/services/infrastructure';
import type { CodexParsedSession } from '@main/services/parsing';
import type {
  CodexChunk,
  CodexProject,
  CodexSearchSessionsResult,
  CodexSession,
  CodexStatsScope,
  CodexStatsSummary,
} from '@main/types';

export interface CodexDevtoolsApi {
  channels: typeof IPC_CHANNELS;
  getProjects: () => Promise<CodexProject[]>;
  getSessions: (projectCwd: string) => Promise<CodexSession[]>;
  getSessionDetail: (sessionId: string) => Promise<CodexParsedSession | null>;
  getSessionChunks: (sessionId: string) => Promise<CodexChunk[] | null>;
  getStats: (scope?: CodexStatsScope) => Promise<CodexStatsSummary>;
  searchSessions: (query: string) => Promise<CodexSearchSessionsResult>;
  getConfig: () => Promise<CodexDevToolsConfig>;
  updateConfig: (key: keyof CodexDevToolsConfig, value: unknown) => Promise<CodexDevToolsConfig | null>;
  getAppVersion: () => Promise<string>;
  onFileChange: (callback: (event: CodexFileChangeEvent) => void) => () => void;
}

export function createCodexDevtoolsApi(
  renderer: Pick<IpcRenderer, 'invoke' | 'on' | 'removeListener'> = ipcRenderer,
): CodexDevtoolsApi {
  return {
    channels: IPC_CHANNELS,
    getProjects: () => renderer.invoke(IPC_CHANNELS.SESSIONS_GET_PROJECTS),
    getSessions: (projectCwd: string) => renderer.invoke(IPC_CHANNELS.SESSIONS_GET_SESSIONS, projectCwd),
    getSessionDetail: (sessionId: string) => renderer.invoke(IPC_CHANNELS.SESSIONS_GET_DETAIL, sessionId),
    getSessionChunks: (sessionId: string) => renderer.invoke(IPC_CHANNELS.SESSIONS_GET_CHUNKS, sessionId),
    getStats: (scope?: CodexStatsScope) => renderer.invoke(IPC_CHANNELS.SESSIONS_GET_STATS, scope),
    searchSessions: (query: string) => renderer.invoke(IPC_CHANNELS.SEARCH_SESSIONS, query),
    getConfig: () => renderer.invoke(IPC_CHANNELS.CONFIG_GET),
    updateConfig: (key, value) => renderer.invoke(IPC_CHANNELS.CONFIG_UPDATE, key, value),
    getAppVersion: () => renderer.invoke(IPC_CHANNELS.UTILITY_GET_APP_VERSION),
    onFileChange: (callback) => {
      const listener = (_event: IpcRendererEvent, payload: unknown): void => {
        callback(payload as CodexFileChangeEvent);
      };

      renderer.on(IPC_CHANNELS.EVENTS_FILE_CHANGE, listener);
      return (): void => {
        renderer.removeListener(IPC_CHANNELS.EVENTS_FILE_CHANGE, listener);
      };
    },
  };
}
