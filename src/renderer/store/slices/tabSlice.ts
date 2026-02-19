import type { RendererApi } from '@renderer/api';
import type { CodexSession } from '@main/types';
import type { StateCreator } from 'zustand';

import type { AppState, AppTab } from '../types';

const DASHBOARD_TAB_ID = 'dashboard';
const SETTINGS_TAB_ID = 'settings';

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
  openSettingsTab: () => void;
  setActiveTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
}

export const createTabSlice = (_client: RendererApi): StateCreator<AppState, [], [], TabSlice> => (
  set,
  get,
) => ({
  openTabs: [{ id: DASHBOARD_TAB_ID, type: 'dashboard', label: 'Dashboard' }],
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
    const hasDashboard = get().openTabs.some((tab) => tab.id === DASHBOARD_TAB_ID);

    if (!hasDashboard) {
      const dashboardTab: AppTab = { id: DASHBOARD_TAB_ID, type: 'dashboard', label: 'Dashboard' };
      set((state) => ({
        openTabs: [dashboardTab, ...state.openTabs],
        activeTabId: DASHBOARD_TAB_ID,
      }));
      return;
    }

    set({ activeTabId: DASHBOARD_TAB_ID });
  },

  openSettingsTab: () => {
    const existing = get().openTabs.find((tab) => tab.id === SETTINGS_TAB_ID);
    if (existing) {
      set({ activeTabId: SETTINGS_TAB_ID });
      return;
    }

    const settingsTab: AppTab = { id: SETTINGS_TAB_ID, type: 'settings', label: 'Settings' };
    set((state) => ({
      openTabs: [...state.openTabs, settingsTab],
      activeTabId: SETTINGS_TAB_ID,
    }));
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
  },

  closeTab: (tabId) => {
    if (tabId === DASHBOARD_TAB_ID) {
      return;
    }

    set((state) => {
      const nextTabs = state.openTabs.filter((tab) => tab.id !== tabId);
      const safeTabs: AppTab[] =
        nextTabs.length > 0
          ? nextTabs
          : [{ id: DASHBOARD_TAB_ID, type: 'dashboard', label: 'Dashboard' }];
      const nextActiveTabId = state.activeTabId === tabId ? safeTabs[safeTabs.length - 1].id : state.activeTabId;
      const activeTab = safeTabs.find((tab) => tab.id === nextActiveTabId);

      return {
        openTabs: safeTabs,
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
