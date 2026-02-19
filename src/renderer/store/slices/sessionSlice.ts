import { isElectronMode, type RendererApi } from '@renderer/api';
import type { CodexChunk, CodexSession } from '@main/types';
import { isCodexBootstrapMessage } from '@shared/utils';
import { createLogger } from '@shared/utils/logger';
import type { StateCreator } from 'zustand';

import type { AppState } from '../types';

const logger = createLogger('Store:sessionSlice');
const PREVIEW_PREFETCH_LIMIT = 25;
const DEFAULT_PREFETCH_PREVIEWS = isElectronMode();

function normalizeFilePath(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/\/+/g, '/');
}

function getFileName(value: string): string {
  const normalized = normalizeFilePath(value);
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? '';
}

function removeSessionUpdateBadge(
  badges: Record<string, boolean>,
  sessionId: string,
): Record<string, boolean> | null {
  if (!badges[sessionId]) {
    return null;
  }

  const nextBadges = { ...badges };
  delete nextBadges[sessionId];
  return nextBadges;
}

function extractFirstMessagePreview(chunks: CodexChunk[] | null): string | null {
  if (!chunks || chunks.length === 0) {
    return null;
  }

  const firstUser = chunks.find(
    (chunk): chunk is Extract<CodexChunk, { type: 'user' }> =>
      chunk.type === 'user' &&
      chunk.content.trim().length > 0 &&
      !isCodexBootstrapMessage(chunk.content),
  );
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
  sessionUpdateBadges: Record<string, boolean>;
  fetchSessions: (
    projectCwd?: string,
    options?: {
      prefetchPreviews?: boolean;
      background?: boolean;
    },
  ) => Promise<void>;
  selectSession: (sessionId: string) => Promise<void>;
  markSessionUpdatedByPath: (filePath: string) => void;
}

export const createSessionSlice = (
  client: RendererApi,
): StateCreator<AppState, [], [], SessionSlice> => (set, get) => ({
  sessions: [],
  activeSessionId: null,
  sessionsLoading: false,
  sessionsError: null,
  sessionPreviews: {},
  sessionUpdateBadges: {},

  fetchSessions: async (projectCwd, options) => {
    const cwd = projectCwd ?? get().activeProjectCwd;
    if (!cwd) {
      set({ sessions: [], activeSessionId: null });
      return;
    }

    const shouldPrefetchPreviews = options?.prefetchPreviews ?? DEFAULT_PREFETCH_PREVIEWS;
    const isBackgroundRefresh = options?.background ?? false;
    if (!isBackgroundRefresh) {
      set({ sessionsLoading: true, sessionsError: null });
    }

    try {
      const sessions = await client.getSessions(cwd);
      set((state) => {
        const nextActiveSessionId = sessions.some((session) => session.id === state.activeSessionId)
          ? state.activeSessionId
          : null;
        const previousSessionsById = new Map(state.sessions.map((session) => [session.id, session]));
        const nextBadges: Record<string, boolean> = {};
        const validSessionIds = new Set(sessions.map((session) => session.id));
        for (const [sessionId, hasUpdate] of Object.entries(state.sessionUpdateBadges)) {
          if (hasUpdate && validSessionIds.has(sessionId)) {
            nextBadges[sessionId] = true;
          }
        }

        for (const session of sessions) {
          const previous = previousSessionsById.get(session.id);
          if (!previous) {
            continue;
          }

          const previousSize = previous.fileSizeBytes;
          const nextSize = session.fileSizeBytes;
          if (
            typeof previousSize === 'number' &&
            Number.isFinite(previousSize) &&
            typeof nextSize === 'number' &&
            Number.isFinite(nextSize) &&
            nextSize > previousSize
          ) {
            nextBadges[session.id] = true;
          }
        }

        return {
          sessions,
          sessionsLoading: isBackgroundRefresh ? state.sessionsLoading : false,
          activeSessionId: nextActiveSessionId,
          sessionUpdateBadges: nextBadges,
        };
      });

      if (shouldPrefetchPreviews) {
        void (async () => {
          try {
            for (const session of sessions.slice(0, PREVIEW_PREFETCH_LIMIT)) {
              const chunks = await client.getSessionChunks(session.id);
              const preview = extractFirstMessagePreview(chunks);

              if (!preview) {
                continue;
              }

              set((state) => ({
                sessionPreviews: {
                  ...state.sessionPreviews,
                  [session.id]: preview,
                },
              }));
            }
          } catch (error) {
            logger.error('Failed to prefetch session previews', error);
          }
        })();
      }
    } catch (error) {
      set({
        sessionsLoading: isBackgroundRefresh ? get().sessionsLoading : false,
        sessionsError: error instanceof Error ? error.message : 'Failed to fetch sessions',
      });
    }
  },

  selectSession: async (sessionId) => {
    set((state) => {
      const nextBadges = removeSessionUpdateBadge(state.sessionUpdateBadges, sessionId);
      if (!nextBadges) {
        return { activeSessionId: sessionId };
      }

      return {
        activeSessionId: sessionId,
        sessionUpdateBadges: nextBadges,
      };
    });

    const session = get().sessions.find((item) => item.id === sessionId);
    if (session) {
      get().openSessionTab(session, get().sessionPreviews[session.id]);
    }

    await get().fetchChunks(sessionId);
  },

  markSessionUpdatedByPath: (filePath) => {
    if (!filePath) {
      return;
    }

    set((state) => {
      const normalizedIncomingPath = normalizeFilePath(filePath);
      const incomingFileName = getFileName(normalizedIncomingPath);

      const exactMatch = state.sessions.find((item) => {
        const normalizedSessionPath = normalizeFilePath(item.filePath);
        return normalizedSessionPath === normalizedIncomingPath;
      });

      let matchedSession = exactMatch ?? null;
      if (!matchedSession && incomingFileName.length > 0) {
        const fileNameMatches = state.sessions.filter((item) => {
          const normalizedSessionPath = normalizeFilePath(item.filePath);
          return getFileName(normalizedSessionPath) === incomingFileName;
        });

        if (fileNameMatches.length === 1) {
          matchedSession = fileNameMatches[0];
        }
      }

      if (!matchedSession || state.sessionUpdateBadges[matchedSession.id]) {
        return {};
      }

      return {
        sessionUpdateBadges: {
          ...state.sessionUpdateBadges,
          [matchedSession.id]: true,
        },
      };
    });
  },
});
