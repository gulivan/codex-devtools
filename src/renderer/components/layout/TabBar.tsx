import { useAppStore } from '@renderer/store';

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

  return (
    <header className="tabbar-shell">
      <div className="tabbar-actions">
        <button className="tabbar-action" onClick={toggleSidebarCollapsed} type="button">
          {sidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar'}
        </button>
        <button className="tabbar-action" onClick={openDashboardTab} type="button">
          Dashboard
        </button>
        <button className="tabbar-action" onClick={openSettingsTab} type="button">
          Settings
        </button>
      </div>

      <div className="tabbar-tabs" role="tablist" aria-label="Open tabs">
        {openTabs.map((tab) => {
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

              {tab.type !== 'dashboard' ? (
                <button
                  type="button"
                  className="tab-chip-close"
                  onClick={() => closeTab(tab.id)}
                  aria-label={`Close ${tab.label}`}
                >
                  ×
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </header>
  );
};
