import { useCallback, useEffect, useState } from 'react';

import { api } from '@renderer/api';
import { useAppStore } from '@renderer/store';

import type { CodexDevToolsConfig } from '@main/services/infrastructure';
import type { CodexAppUpdateStatus } from '@main/types';

function formatVersionLabel(value: string | null): string {
  if (!value || value.trim().length === 0) {
    return 'unknown';
  }

  return value.startsWith('v') ? value : `v${value}`;
}

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
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<CodexAppUpdateStatus | null>(null);
  const [updateCheckLoading, setUpdateCheckLoading] = useState(false);
  const [updateCheckError, setUpdateCheckError] = useState<string | null>(null);

  useEffect(() => {
    if (!appConfig && !configLoading) {
      void fetchConfig();
    }
  }, [appConfig, configLoading, fetchConfig]);

  useEffect(() => {
    let cancelled = false;

    void api.getAppVersion()
      .then((version) => {
        if (!cancelled) {
          setAppVersion(version);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAppVersion('0.0.0');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!appConfig) {
      return;
    }

    setWatchPath(appConfig.general.codexSessionsPath ?? '');
    setTheme(appConfig.display.theme);
    setShowAttachmentPreviews(appConfig.display.showAttachmentPreviews);
  }, [appConfig]);

  const handleCheckForUpdates = useCallback(() => {
    setUpdateCheckLoading(true);
    setUpdateCheckError(null);

    void api.checkAppUpdate()
      .then((status) => {
        setUpdateStatus(status);
        setAppVersion(status.currentVersion);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Failed to check for updates.';
        setUpdateCheckError(message);
      })
      .finally(() => {
        setUpdateCheckLoading(false);
      });
  }, []);

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

      <section className="settings-section">
        <h3>App updates</h3>
        <p className="settings-update-copy">
          Current version: <code>{formatVersionLabel(appVersion)}</code>
        </p>
        {updateStatus ? (
          <p className={`settings-update-copy ${updateStatus.error ? 'is-error' : 'is-success'}`}>
            {updateStatus.error
              ? `Update check failed: ${updateStatus.error}`
              : updateStatus.updateAvailable
              ? `Update available: ${formatVersionLabel(updateStatus.latestVersion)}`
              : 'You are up to date.'}
          </p>
        ) : updateCheckError ? (
          <p className="settings-update-copy is-error">Update check failed: {updateCheckError}</p>
        ) : (
          <p className="settings-update-copy">Check for updates to compare against the latest GitHub release.</p>
        )}
        <div className="settings-actions settings-actions-split">
          {updateStatus?.releaseUrl ? (
            <a
              href={updateStatus.releaseUrl}
              target="_blank"
              rel="noreferrer"
              className="tabbar-action"
            >
              Open latest release
            </a>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="tabbar-action primary"
            onClick={handleCheckForUpdates}
            disabled={updateCheckLoading}
          >
            {updateCheckLoading ? 'Checking...' : 'Check for updates'}
          </button>
        </div>
      </section>
    </div>
  );
};
