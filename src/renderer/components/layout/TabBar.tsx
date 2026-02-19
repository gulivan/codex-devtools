import { ChevronsLeft, ChevronsRight } from 'lucide-react';

import { useAppStore } from '@renderer/store';

const DASHBOARD_TAB_ID = 'dashboard';
const SETTINGS_TAB_ID = 'settings';

export const TabBar = (): JSX.Element => {
  const {
    openTabs,
    activeTabId,
    setActiveTab,
    closeTab,
    openDashboardTab,
    openSettingsTab,
    toggleSidebarCollapsed,
    sidebarCollapsed,
  } = useAppStore((state) => ({
    openTabs: state.openTabs,
    activeTabId: state.activeTabId,
    setActiveTab: state.setActiveTab,
    closeTab: state.closeTab,
    openDashboardTab: state.openDashboardTab,
    openSettingsTab: state.openSettingsTab,
    toggleSidebarCollapsed: state.toggleSidebarCollapsed,
    sidebarCollapsed: state.sidebarCollapsed,
  }));

  const SidebarToggleIcon = sidebarCollapsed ? ChevronsRight : ChevronsLeft;
  const sessionTabs = openTabs.filter((tab) => tab.type === 'session');

  return (
    <header className="tabbar-shell">
      <div className="tabbar-main-row">
        <button
          className="tabbar-icon-button"
          onClick={toggleSidebarCollapsed}
          type="button"
          aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
          title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        >
          <SidebarToggleIcon size={16} aria-hidden="true" />
        </button>

        <div className="tabbar-main-tabs" role="tablist" aria-label="Main views">
          <button
            className={`tabbar-action ${activeTabId === DASHBOARD_TAB_ID ? 'active' : ''}`}
            onClick={openDashboardTab}
            type="button"
            role="tab"
            aria-selected={activeTabId === DASHBOARD_TAB_ID}
          >
            Dashboard
          </button>
          <button
            className={`tabbar-action ${activeTabId === SETTINGS_TAB_ID ? 'active' : ''}`}
            onClick={openSettingsTab}
            type="button"
            role="tab"
            aria-selected={activeTabId === SETTINGS_TAB_ID}
          >
            Settings
          </button>
        </div>
      </div>

      {sessionTabs.length > 0 ? (
        <div className="tabbar-secondary-row">
          <div className="tabbar-tabs" role="tablist" aria-label="Open sessions">
            {sessionTabs.map((tab) => {
              const isActive = tab.id === activeTabId;

              return (
                <div key={tab.id} className={`tab-chip ${isActive ? 'active' : ''}`}>
                  <button
                    type="button"
                    className="tab-chip-button"
                    onClick={() => setActiveTab(tab.id)}
                    role="tab"
                    aria-selected={isActive}
                  >
                    {tab.label}
                  </button>

                  <button
                    type="button"
                    className="tab-chip-close"
                    onClick={() => closeTab(tab.id)}
                    aria-label={`Close ${tab.label}`}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </header>
  );
};
