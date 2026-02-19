import type { RendererApi } from '@renderer/api';
import type { CodexDevToolsConfig } from '@main/services/infrastructure';
import type { StateCreator } from 'zustand';

import type { AppState } from '../types';

export interface UISlice {
  theme: CodexDevToolsConfig['display']['theme'];
  sidebarCollapsed: boolean;
  searchQuery: string;
  setTheme: (theme: CodexDevToolsConfig['display']['theme']) => void;
  toggleSidebarCollapsed: () => void;
  setSearchQuery: (query: string) => void;
}

export const createUISlice = (_client: RendererApi): StateCreator<AppState, [], [], UISlice> => (set) => ({
  theme: 'dark',
  sidebarCollapsed: false,
  searchQuery: '',

  setTheme: (theme) => {
    set({ theme });
  },

  toggleSidebarCollapsed: () => {
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },
});
