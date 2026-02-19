import { useMemo } from 'react';

import { useAppStore } from '@renderer/store';

import { DashboardView } from '../dashboard/DashboardView';
import { SettingsView } from '../settings/SettingsView';

import { SessionTabContent } from './SessionTabContent';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';

export const TabbedLayout = (): JSX.Element => {
  const { openTabs, activeTabId, sidebarCollapsed } = useAppStore((state) => ({
    openTabs: state.openTabs,
    activeTabId: state.activeTabId,
    sidebarCollapsed: state.sidebarCollapsed,
  }));

  const activeTab = useMemo(
    () => openTabs.find((tab) => tab.id === activeTabId) ?? openTabs[0],
    [openTabs, activeTabId],
  );

  return (
    <div className="layout-shell">
      {!sidebarCollapsed ? <Sidebar /> : null}

      <section className="content-shell">
        <TabBar />

        <div className="content-body">
          {activeTab?.type === 'session' ? <SessionTabContent tab={activeTab} /> : null}
          {activeTab?.type === 'dashboard' ? <DashboardView /> : null}
          {activeTab?.type === 'settings' ? <SettingsView /> : null}
        </div>
      </section>
    </div>
  );
};
