import type { RendererApi } from '@renderer/api';
import type { CodexDevToolsConfig } from '@main/services/infrastructure';
import type { StateCreator } from 'zustand';

import type { AppState } from '../types';

export interface ConfigSlice {
  appConfig: CodexDevToolsConfig | null;
  configLoading: boolean;
  configError: string | null;
  fetchConfig: () => Promise<void>;
  updateConfig: (key: keyof CodexDevToolsConfig, value: unknown) => Promise<void>;
}

export const createConfigSlice = (
  client: RendererApi,
): StateCreator<AppState, [], [], ConfigSlice> => (set, get) => ({
  appConfig: null,
  configLoading: false,
  configError: null,

  fetchConfig: async () => {
    set({ configLoading: true, configError: null });

    try {
      const appConfig = await client.getConfig();
      set({
        appConfig,
        configLoading: false,
      });
      get().setTheme(appConfig.display.theme);
    } catch (error) {
      set({
        configLoading: false,
        configError: error instanceof Error ? error.message : 'Failed to fetch config',
      });
    }
  },

  updateConfig: async (key, value) => {
    try {
      const nextConfig = await client.updateConfig(key, value);
      if (!nextConfig) {
        set({ configError: 'Failed to update config' });
        return;
      }

      set({
        appConfig: nextConfig,
        configError: null,
      });

      if (key === 'display') {
        get().setTheme(nextConfig.display.theme);
      }
    } catch (error) {
      set({
        configError: error instanceof Error ? error.message : 'Failed to update config',
      });
    }
  },
});
