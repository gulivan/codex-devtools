import { useMemo } from 'react';

import { useAppStore } from '@renderer/store';

export const DashboardView = (): JSX.Element => {
  const { projects, sessions, activeProjectCwd, selectProject, selectSession, openSettingsTab } = useAppStore(
    (state) => ({
      projects: state.projects,
      sessions: state.sessions,
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
            {recentSessions.map((session) => (
              <li key={session.id}>
                <button
                  type="button"
                  className="dashboard-session-item"
                  onClick={() => {
                    void selectProject(session.cwd);
                    void selectSession(session.id);
                  }}
                >
                  <span className="dashboard-session-title">{session.model || 'Session'}</span>
                  <span className="dashboard-session-meta">{session.cwd}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
