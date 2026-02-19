import { api, type RendererApi } from '@renderer/api';
import { create } from 'zustand';

import { createConfigSlice } from './slices/configSlice';
import { createConversationSlice } from './slices/conversationSlice';
import { createPaneSlice } from './slices/paneSlice';
import { createProjectSlice } from './slices/projectSlice';
import { createSessionSlice } from './slices/sessionSlice';
import { createTabSlice } from './slices/tabSlice';
import { createUISlice } from './slices/uiSlice';

import type { AppState } from './types';

export const createAppStore = (client: RendererApi = api) =>
  create<AppState>()((...args) => ({
    ...createProjectSlice(client)(...args),
    ...createSessionSlice(client)(...args),
    ...createConversationSlice(client)(...args),
    ...createConfigSlice(client)(...args),
    ...createTabSlice(client)(...args),
    ...createPaneSlice(client)(...args),
    ...createUISlice(client)(...args),
  }));

export const useAppStore = createAppStore();

interface StoreAccess {
  getState: () => AppState;
}

export function initializeEventListeners(
  store: StoreAccess = useAppStore,
  client: RendererApi = api,
): () => void {
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;

  const cleanup = client.onFileChange(() => {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }

    refreshTimer = setTimeout(() => {
      const state = store.getState();
      void state.fetchProjects();

      if (state.activeProjectCwd) {
        void state.fetchSessions(state.activeProjectCwd);
      }

      if (state.activeSessionId) {
        void state.fetchChunks(state.activeSessionId);
      }
    }, 120);
  });

  return (): void => {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }

    cleanup();
  };
}

export * from './types';
