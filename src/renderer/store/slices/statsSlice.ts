import type { RendererApi } from '@renderer/api';
import type { CodexStatsScope, CodexStatsSummary } from '@main/types';
import type { StateCreator } from 'zustand';

import type { AppState } from '../types';

function normalizeScope(scope: CodexStatsScope | undefined): CodexStatsScope {
  if (!scope || scope.type === 'all') {
    return { type: 'all' };
  }

  const cwd = scope.cwd?.trim();
  if (!cwd) {
    return { type: 'all' };
  }

  return {
    type: 'project',
    cwd,
  };
}

export interface StatsSlice {
  statsData: CodexStatsSummary | null;
  statsScope: CodexStatsScope;
  statsLoading: boolean;
  statsError: string | null;
  fetchStats: (scope?: CodexStatsScope, options?: { background?: boolean }) => Promise<void>;
  setStatsScope: (scope: CodexStatsScope) => Promise<void>;
}

export const createStatsSlice = (
  client: RendererApi,
): StateCreator<AppState, [], [], StatsSlice> => (set, get) => ({
  statsData: null,
  statsScope: { type: 'all' },
  statsLoading: false,
  statsError: null,

  fetchStats: async (scope, options) => {
    const resolvedScope = normalizeScope(scope ?? get().statsScope);
    const background = options?.background ?? false;
    if (!background) {
      set({ statsLoading: true, statsError: null });
    }

    try {
      const statsData = await client.getStats(resolvedScope);
      set((state) => ({
        statsData,
        statsScope: resolvedScope,
        statsLoading: background ? state.statsLoading : false,
        statsError: null,
      }));
    } catch (error) {
      set((state) => ({
        statsScope: resolvedScope,
        statsLoading: background ? state.statsLoading : false,
        statsError: error instanceof Error ? error.message : 'Failed to fetch stats',
      }));
    }
  },

  setStatsScope: async (scope) => {
    const resolvedScope = normalizeScope(scope);
    set({ statsScope: resolvedScope });
    await get().fetchStats(resolvedScope);
  },
});
