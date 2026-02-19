import type { RendererApi } from '@renderer/api';
import type { CodexChunk, CodexSession } from '@main/types';
import { createLogger } from '@shared/utils/logger';
import type { StateCreator } from 'zustand';

import type { AppState } from '../types';

const logger = createLogger('Store:sessionSlice');

function extractFirstMessagePreview(chunks: CodexChunk[] | null): string | null {
  if (!chunks || chunks.length === 0) {
    return null;
  }

  const firstUser = chunks.find((chunk) => chunk.type === 'user');
  if (!firstUser || !firstUser.content.trim()) {
    return null;
  }

  return firstUser.content.trim().replace(/\s+/g, ' ').slice(0, 96);
}

export interface SessionSlice {
  sessions: CodexSession[];
  activeSessionId: string | null;
  sessionsLoading: boolean;
  sessionsError: string | null;
  sessionPreviews: Record<string, string>;
  fetchSessions: (projectCwd?: string) => Promise<void>;
  selectSession: (sessionId: string) => Promise<void>;
}

export const createSessionSlice = (
  client: RendererApi,
): StateCreator<AppState, [], [], SessionSlice> => (set, get) => ({
  sessions: [],
  activeSessionId: null,
  sessionsLoading: false,
  sessionsError: null,
  sessionPreviews: {},

  fetchSessions: async (projectCwd) => {
    const cwd = projectCwd ?? get().activeProjectCwd;
    if (!cwd) {
      set({ sessions: [], activeSessionId: null });
      return;
    }

    set({ sessionsLoading: true, sessionsError: null });

    try {
      const sessions = await client.getSessions(cwd);
      set((state) => {
        const nextActiveSessionId = sessions.some((session) => session.id === state.activeSessionId)
          ? state.activeSessionId
          : null;

        return {
          sessions,
          sessionsLoading: false,
          activeSessionId: nextActiveSessionId,
        };
      });

      void Promise.all(
        sessions.slice(0, 25).map(async (session) => {
          const chunks = await client.getSessionChunks(session.id);
          const preview = extractFirstMessagePreview(chunks);

          if (!preview) {
            return;
          }

          set((state) => ({
            sessionPreviews: {
              ...state.sessionPreviews,
              [session.id]: preview,
            },
          }));
        }),
      ).catch((error) => {
        logger.error('Failed to prefetch session previews', error);
      });
    } catch (error) {
      set({
        sessionsLoading: false,
        sessionsError: error instanceof Error ? error.message : 'Failed to fetch sessions',
      });
    }
  },

  selectSession: async (sessionId) => {
    set({ activeSessionId: sessionId });

    const session = get().sessions.find((item) => item.id === sessionId);
    if (session) {
      get().openSessionTab(session, get().sessionPreviews[session.id]);
    }

    await get().fetchChunks(sessionId);
  },
});
