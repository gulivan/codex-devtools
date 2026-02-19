import { useEffect, useState } from 'react';

import { useAppStore } from '@renderer/store';

import type { CodexDevToolsConfig } from '@main/services/infrastructure';

export const SettingsView = (): JSX.Element => {
  const { appConfig, configLoading, fetchConfig, updateConfig } = useAppStore((state) => ({
    appConfig: state.appConfig,
    configLoading: state.configLoading,
    fetchConfig: state.fetchConfig,
    updateConfig: state.updateConfig,
  }));

  const [watchPath, setWatchPath] = useState('');
  const [theme, setTheme] = useState<CodexDevToolsConfig['display']['theme']>('dark');
  const [showAttachmentPreviews, setShowAttachmentPreviews] = useState(true);

  useEffect(() => {
    if (!appConfig && !configLoading) {
      void fetchConfig();
    }
  }, [appConfig, configLoading, fetchConfig]);

  useEffect(() => {
    if (!appConfig) {
      return;
    }

    setWatchPath(appConfig.general.codexSessionsPath ?? '');
    setTheme(appConfig.display.theme);
    setShowAttachmentPreviews(appConfig.display.showAttachmentPreviews);
  }, [appConfig]);

  if (!appConfig) {
    return (
      <div className="empty-view">
        <p className="empty-title">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="settings-shell">
      <header className="settings-header">
        <h2>Settings</h2>
        <p>Configure watch path and display preferences.</p>
      </header>

      <section className="settings-section">
        <h3>Watch path</h3>
        <label className="sidebar-label" htmlFor="watch-path">
          Codex sessions path
        </label>
        <input
          id="watch-path"
          className="app-input"
          value={watchPath}
          onChange={(event) => setWatchPath(event.target.value)}
          placeholder="~/.codex/sessions"
        />
        <div className="settings-actions">
          <button
            type="button"
            className="tabbar-action primary"
            onClick={() => {
              void updateConfig('general', { codexSessionsPath: watchPath });
            }}
          >
            Save path
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h3>Theme</h3>
        <div className="theme-toggle-grid">
          {(['system', 'dark', 'light'] as const).map((themeOption) => (
            <label key={themeOption} className="theme-option">
              <input
                type="radio"
                name="theme"
                value={themeOption}
                checked={theme === themeOption}
                onChange={() => setTheme(themeOption)}
              />
              <span>{themeOption}</span>
            </label>
          ))}
        </div>
        <div className="settings-actions">
          <button
            type="button"
            className="tabbar-action primary"
            onClick={() => {
              void updateConfig('display', { theme });
            }}
          >
            Apply theme
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h3>Attachments</h3>
        <label className="settings-toggle" htmlFor="show-attachment-previews">
          <input
            id="show-attachment-previews"
            type="checkbox"
            checked={showAttachmentPreviews}
            onChange={(event) => setShowAttachmentPreviews(event.target.checked)}
          />
          <span>Show attachment previews in chat</span>
        </label>
        <div className="settings-actions">
          <button
            type="button"
            className="tabbar-action primary"
            onClick={() => {
              void updateConfig('display', { showAttachmentPreviews });
            }}
          >
            Save attachment preferences
          </button>
        </div>
      </section>
    </div>
  );
};
