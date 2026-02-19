import { contextBridge } from 'electron';

import { createCodexDevtoolsApi, type CodexDevtoolsApi } from './api';

const api = createCodexDevtoolsApi();
contextBridge.exposeInMainWorld('codexDevtools', api);

declare global {
  interface Window {
    codexDevtools: CodexDevtoolsApi;
  }
}
