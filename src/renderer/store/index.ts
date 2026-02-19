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

const REFRESH_DEBOUNCE_MS = 120;
const FALLBACK_POLL_INTERVAL_MS = 5000;

export function initializeEventListeners(
  store: StoreAccess = useAppStore,
  client: RendererApi = api,
): () => void {
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let polling = false;

  const cleanup = client.onFileChange((event) => {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }

    refreshTimer = setTimeout(() => {
      const state = store.getState();
      state.markSessionUpdatedByPath(event.filePath);
      void state.fetchProjects();

      if (state.activeProjectCwd) {
        void state.fetchSessions(state.activeProjectCwd, {
          prefetchPreviews: false,
          background: true,
        }).then(() => {
          store.getState().markSessionUpdatedByPath(event.filePath);
        });
      }

      if (state.activeSessionId) {
        void state.fetchChunks(state.activeSessionId);
      }
    }, REFRESH_DEBOUNCE_MS);
  });

  const runFallbackRefresh = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      return;
    }

    if (polling) {
      return;
    }

    const state = store.getState();
    if (state.sessionsLoading || state.chunksLoading) {
      return;
    }

    if (!state.activeProjectCwd && !state.activeSessionId) {
      return;
    }

    polling = true;
    void Promise.all([
      state.activeProjectCwd
        ? state.fetchSessions(state.activeProjectCwd, {
            prefetchPreviews: false,
            background: true,
          })
        : Promise.resolve(),
      state.activeSessionId ? state.fetchChunks(state.activeSessionId) : Promise.resolve(),
    ]).finally(() => {
      polling = false;
    });
  };

  pollTimer = setInterval(runFallbackRefresh, FALLBACK_POLL_INTERVAL_MS);

  return (): void => {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }

    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }

    cleanup();
  };
}

export * from './types';
