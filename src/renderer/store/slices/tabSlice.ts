import type { RendererApi } from '@renderer/api';
import type { CodexSession } from '@main/types';
import type { StateCreator } from 'zustand';

import type { AppState, AppTab } from '../types';

export const DASHBOARD_TAB_ID = 'dashboard';
export const SETTINGS_TAB_ID = 'settings';
export const STATS_TAB_ID = 'stats';

function createSessionTabId(sessionId: string): string {
  return `session:${sessionId}`;
}

function defaultSessionLabel(session: CodexSession): string {
  return session.model ? `${session.model} · ${session.id.slice(0, 8)}` : session.id.slice(0, 8);
}

export interface TabSlice {
  openTabs: AppTab[];
  activeTabId: string;
  openSessionTab: (session: CodexSession, previewLabel?: string) => void;
  openDashboardTab: () => void;
  openStatsTab: () => void;
  openSettingsTab: () => void;
  setActiveTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
}

export const createTabSlice = (_client: RendererApi): StateCreator<AppState, [], [], TabSlice> => (
  set,
  get,
) => ({
  openTabs: [],
  activeTabId: DASHBOARD_TAB_ID,

  openSessionTab: (session, previewLabel) => {
    const tabId = createSessionTabId(session.id);
    const existing = get().openTabs.find((tab) => tab.id === tabId);

    if (existing) {
      set({ activeTabId: tabId });
      return;
    }

    const nextTab: AppTab = {
      id: tabId,
      type: 'session',
      label: previewLabel || defaultSessionLabel(session),
      sessionId: session.id,
    };

    set((state) => ({
      openTabs: [...state.openTabs, nextTab],
      activeTabId: tabId,
    }));
  },

  openDashboardTab: () => {
    set({ activeTabId: DASHBOARD_TAB_ID, activeSessionId: null });
  },

  openStatsTab: () => {
    set({ activeTabId: STATS_TAB_ID, activeSessionId: null });
    void get().fetchStats(get().statsScope);
  },

  openSettingsTab: () => {
    set({ activeTabId: SETTINGS_TAB_ID, activeSessionId: null });
  },

  setActiveTab: (tabId) => {
    const tab = get().openTabs.find((item) => item.id === tabId);
    if (!tab) {
      return;
    }

    set({
      activeTabId: tabId,
      activeSessionId: tab.type === 'session' ? tab.sessionId ?? null : null,
    });

    if (tab.type === 'session' && tab.sessionId) {
      void get().fetchChunks(tab.sessionId);
    }

    if (tab.type === 'stats') {
      void get().fetchStats(get().statsScope);
    }
  },

  closeTab: (tabId) => {
    set((state) => {
      const nextTabs = state.openTabs.filter((tab) => tab.id !== tabId);
      const nextActiveTabId =
        state.activeTabId === tabId ? (nextTabs[nextTabs.length - 1]?.id ?? DASHBOARD_TAB_ID) : state.activeTabId;
      const activeTab = nextTabs.find((tab) => tab.id === nextActiveTabId);

      return {
        openTabs: nextTabs,
        activeTabId: nextActiveTabId,
        activeSessionId: activeTab?.type === 'session' ? activeTab.sessionId ?? null : null,
      };
    });

    const activeTab = get().openTabs.find((tab) => tab.id === get().activeTabId);
    if (activeTab?.type === 'session' && activeTab.sessionId) {
      void get().fetchChunks(activeTab.sessionId);
    } else {
      get().setChunks([]);
    }
  },
});
