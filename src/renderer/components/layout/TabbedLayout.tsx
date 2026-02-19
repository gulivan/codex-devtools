import { useMemo } from 'react';

import { useAppStore } from '@renderer/store';

import { DashboardView } from '../dashboard/DashboardView';
import { SettingsView } from '../settings/SettingsView';

import { SessionTabContent } from './SessionTabContent';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';

const DASHBOARD_TAB_ID = 'dashboard';
const SETTINGS_TAB_ID = 'settings';

export const TabbedLayout = (): JSX.Element => {
  const { openTabs, activeTabId, sidebarCollapsed } = useAppStore((state) => ({
    openTabs: state.openTabs,
    activeTabId: state.activeTabId,
    sidebarCollapsed: state.sidebarCollapsed,
  }));

  const activeSessionTab = useMemo(() => {
    const activeTab = openTabs.find((tab) => tab.id === activeTabId);
    return activeTab?.type === 'session' ? activeTab : null;
  }, [openTabs, activeTabId]);

  const settingsActive = activeTabId === SETTINGS_TAB_ID;
  const dashboardActive = activeTabId === DASHBOARD_TAB_ID || (!settingsActive && !activeSessionTab);

  return (
    <div className="layout-shell">
      {!sidebarCollapsed ? <Sidebar /> : null}

      <section className="content-shell">
        <TabBar />

        <div className="content-body">
          {activeSessionTab ? <SessionTabContent tab={activeSessionTab} /> : null}
          {dashboardActive ? <DashboardView /> : null}
          {settingsActive ? <SettingsView /> : null}
        </div>
      </section>
    </div>
  );
};
