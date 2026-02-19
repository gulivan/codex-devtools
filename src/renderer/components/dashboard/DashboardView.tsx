import { useMemo } from 'react';
import { format, isToday } from 'date-fns';

import { useAppStore } from '@renderer/store';

import type { CodexSession } from '@main/types';

function formatDashboardSessionTime(value: string): string {
  const date = new Date(value);
  if (isToday(date)) {
    return format(date, 'p');
  }

  return format(date, 'MMM d, p');
}

function formatSessionSize(fileSizeBytes: number | undefined): string | null {
  if (typeof fileSizeBytes !== 'number' || !Number.isFinite(fileSizeBytes) || fileSizeBytes < 0) {
    return null;
  }

  if (fileSizeBytes < 1024) {
    return `${fileSizeBytes} B`;
  }

  const kilobytes = fileSizeBytes / 1024;
  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(kilobytes >= 100 ? 0 : 1)} KB`;
  }

  const megabytes = kilobytes / 1024;
  return `${megabytes.toFixed(megabytes >= 100 ? 0 : 1)} MB`;
}

function getDashboardSessionTitle(session: CodexSession, sessionPreviews: Record<string, string>): string {
  return sessionPreviews[session.id] || `Session ${session.id.slice(0, 8)}`;
}

export const DashboardView = (): JSX.Element => {
  const {
    projects,
    sessions,
    sessionPreviews,
    activeProjectCwd,
    selectProject,
    selectSession,
    openSettingsTab,
  } = useAppStore(
    (state) => ({
      projects: state.projects,
      sessions: state.sessions,
      sessionPreviews: state.sessionPreviews,
      activeProjectCwd: state.activeProjectCwd,
      selectProject: state.selectProject,
      selectSession: state.selectSession,
      openSettingsTab: state.openSettingsTab,
    }),
  );

  const totalSessions = useMemo(
    () => projects.reduce((count, project) => count + project.sessionCount, 0),
    [projects],
  );

  const recentSessions = sessions.slice(0, 8);

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <h2>Dashboard</h2>
        <p>Recent Codex activity across your projects.</p>
      </header>

      <section className="dashboard-stats">
        <article className="stat-card">
          <span className="stat-label">Projects</span>
          <strong className="stat-value">{projects.length}</strong>
        </article>

        <article className="stat-card">
          <span className="stat-label">Sessions</span>
          <strong className="stat-value">{totalSessions}</strong>
        </article>

        <article className="stat-card">
          <span className="stat-label">Active project</span>
          <strong className="stat-value">{activeProjectCwd ? activeProjectCwd.split('/').pop() : 'None'}</strong>
        </article>
      </section>

      <section className="dashboard-list">
        <div className="dashboard-section-header">
          <h3>Recent sessions</h3>
          <button type="button" className="tabbar-action" onClick={openSettingsTab}>
            Open settings
          </button>
        </div>

        {recentSessions.length === 0 ? (
          <p className="empty-copy">Select a project from the sidebar to load sessions.</p>
        ) : (
          <ul className="dashboard-session-list">
            {recentSessions.map((session) => {
              const sizeLabel = formatSessionSize(session.fileSizeBytes);

              return (
                <li key={session.id}>
                  <button
                    type="button"
                    className="dashboard-session-item"
                    onClick={() => {
                      void selectProject(session.cwd);
                      void selectSession(session.id);
                    }}
                  >
                    <div className="dashboard-session-header">
                      <span className="dashboard-session-title">
                        {getDashboardSessionTitle(session, sessionPreviews)}
                      </span>
                      <div className="dashboard-session-meta-right">
                        <time className="dashboard-session-time">{formatDashboardSessionTime(session.startTime)}</time>
                        {sizeLabel ? <span className="dashboard-session-size">{sizeLabel}</span> : null}
                      </div>
                    </div>
                    <span className="dashboard-session-meta">{session.cwd}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};
