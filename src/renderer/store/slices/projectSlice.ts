import type { RendererApi } from '@renderer/api';
import type { CodexProject } from '@main/types';
import type { StateCreator } from 'zustand';

import type { AppState } from '../types';

export interface ProjectSlice {
  projects: CodexProject[];
  activeProjectCwd: string | null;
  projectsLoading: boolean;
  projectsError: string | null;
  fetchProjects: () => Promise<void>;
  selectProject: (cwd: string) => Promise<void>;
}

export const createProjectSlice = (
  client: RendererApi,
): StateCreator<AppState, [], [], ProjectSlice> => (set, get) => ({
  projects: [],
  activeProjectCwd: null,
  projectsLoading: false,
  projectsError: null,

  fetchProjects: async () => {
    set({ projectsLoading: true, projectsError: null });

    try {
      const projects = await client.getProjects();
      set({
        projects,
        projectsLoading: false,
      });
    } catch (error) {
      set({
        projectsLoading: false,
        projectsError: error instanceof Error ? error.message : 'Failed to fetch projects',
      });
    }
  },

  selectProject: async (cwd: string) => {
    set({
      activeProjectCwd: cwd,
      activeSessionId: null,
      chunksSessionId: null,
      chunks: [],
    });

    await get().fetchSessions(cwd);
  },
});
