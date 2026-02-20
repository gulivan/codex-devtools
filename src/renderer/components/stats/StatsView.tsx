import { useEffect, useMemo } from 'react';

import { useAppStore } from '@renderer/store';

import type { CodexStatsScope } from '@main/types';

function formatDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return '0m';
  }

  const totalMinutes = Math.round(durationMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${minutes}m`;
  }

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}

function normalizeScope(scope: CodexStatsScope): CodexStatsScope {
  if (scope.type === 'project' && scope.cwd.trim().length > 0) {
    return { type: 'project', cwd: scope.cwd.trim() };
  }

  return { type: 'all' };
}

export const StatsView = (): JSX.Element => {
  const {
    projects,
    statsData,
    statsScope,
    statsLoading,
    statsError,
    fetchStats,
    setStatsScope,
  } = useAppStore((state) => ({
    projects: state.projects,
    statsData: state.statsData,
    statsScope: state.statsScope,
    statsLoading: state.statsLoading,
    statsError: state.statsError,
    fetchStats: state.fetchStats,
    setStatsScope: state.setStatsScope,
  }));

  useEffect(() => {
    if (!statsData && !statsLoading) {
      void fetchStats(statsScope);
    }
  }, [statsData, statsLoading, fetchStats, statsScope]);

  const dailyMaxOutput = useMemo(
    () => Math.max(...(statsData?.daily.map((point) => point.outputTokens) ?? [1])),
    [statsData],
  );

  const hourlyMaxEvents = useMemo(
    () => Math.max(...(statsData?.hourly.map((point) => point.eventCount) ?? [1])),
    [statsData],
  );

  return (
    <div className="stats-shell">
      <header className="stats-header">
        <h2>Stats</h2>
        <p>Token volume, activity patterns, model usage, and reasoning effort.</p>
      </header>

      <section className="stats-controls">
        <label className="sidebar-label" htmlFor="stats-scope">
          Scope
        </label>
        <select
          id="stats-scope"
          className="app-select"
          value={statsScope.type}
          onChange={(event) => {
            if (event.target.value === 'project') {
              const defaultProject = projects[0]?.cwd ?? '';
              void setStatsScope({ type: 'project', cwd: defaultProject });
              return;
            }

            void setStatsScope({ type: 'all' });
          }}
        >
          <option value="all">All projects</option>
          <option value="project">Single project</option>
        </select>

        {statsScope.type === 'project' ? (
          <>
            <label className="sidebar-label" htmlFor="stats-project">
              Project
            </label>
            <select
              id="stats-project"
              className="app-select"
              value={statsScope.cwd}
              onChange={(event) => {
                void setStatsScope({ type: 'project', cwd: event.target.value });
              }}
            >
              {projects.length === 0 ? <option value="">No projects available</option> : null}
              {projects.map((project) => (
                <option key={project.cwd} value={project.cwd}>
                  {project.name} - {project.cwd}
                </option>
              ))}
            </select>
          </>
        ) : null}

        <button
          type="button"
          className="tabbar-action"
          onClick={() => {
            void fetchStats(normalizeScope(statsScope));
          }}
        >
          Refresh
        </button>
      </section>

      {statsError ? <p className="stats-error">{statsError}</p> : null}

      {!statsData ? (
        <div className="empty-view">
          <p className="empty-title">{statsLoading ? 'Loading stats...' : 'No stats available yet'}</p>
        </div>
      ) : (
        <>
          <section className="stats-kpi-grid">
            <article className="stat-card">
              <span className="stat-label">Total tokens</span>
              <strong className="stat-value">{statsData.totals.totalTokens.toLocaleString()}</strong>
            </article>
            <article className="stat-card">
              <span className="stat-label">Generated tokens</span>
              <strong className="stat-value">{statsData.totals.outputTokens.toLocaleString()}</strong>
            </article>
            <article className="stat-card">
              <span className="stat-label">Active time</span>
              <strong className="stat-value">{formatDuration(statsData.totals.durationMs)}</strong>
            </article>
            <article className="stat-card">
              <span className="stat-label">Sessions</span>
              <strong className="stat-value">
                {statsData.totals.sessions.toLocaleString()}
                {statsData.totals.archivedSessions > 0
                  ? ` (${statsData.totals.archivedSessions.toLocaleString()} archived)`
                  : ''}
              </strong>
            </article>
          </section>

          <section className="stats-section">
            <div className="stats-section-header">
              <h3>Generated tokens by day</h3>
              <span className="stats-section-subtle">Output tokens</span>
            </div>
            {statsData.daily.length === 0 ? (
              <p className="empty-copy">No daily token data yet.</p>
            ) : (
              <ul className="stats-day-list">
                {statsData.daily.map((point) => {
                  const widthPercent =
                    dailyMaxOutput > 0 ? Math.max(6, (point.outputTokens / dailyMaxOutput) * 100) : 6;
                  return (
                    <li key={point.date} className="stats-day-row">
                      <span className="stats-day-label">{point.date}</span>
                      <div className="stats-day-bar-wrap">
                        <div className="stats-day-bar" style={{ width: `${widthPercent}%` }} />
                      </div>
                      <span className="stats-day-value">{point.outputTokens.toLocaleString()}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="stats-grid-2">
            <article className="stats-section">
              <div className="stats-section-header">
                <h3>Most active days</h3>
                <span className="stats-section-subtle">By event count</span>
              </div>
              {statsData.topDays.length === 0 ? (
                <p className="empty-copy">No activity data yet.</p>
              ) : (
                <ul className="stats-top-list">
                  {statsData.topDays.map((day) => (
                    <li key={day.date} className="stats-top-item">
                      <span>{day.date}</span>
                      <span>{day.eventCount.toLocaleString()} events</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="stats-section">
              <div className="stats-section-header">
                <h3>Most active hours</h3>
                <span className="stats-section-subtle">By event count</span>
              </div>
              {statsData.topHours.length === 0 ? (
                <p className="empty-copy">No activity data yet.</p>
              ) : (
                <ul className="stats-top-list">
                  {statsData.topHours.map((hour) => (
                    <li key={hour.hour} className="stats-top-item">
                      <span>{String(hour.hour).padStart(2, '0')}:00</span>
                      <span>{hour.eventCount.toLocaleString()} events</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>

          <section className="stats-section">
            <div className="stats-section-header">
              <h3>Hourly activity heatmap</h3>
              <span className="stats-section-subtle">Event count + token volume + session presence</span>
            </div>
            <div className="stats-heatmap-grid">
              {statsData.hourly.map((point) => {
                const intensity = point.eventCount <= 0 ? 0 : point.eventCount / hourlyMaxEvents;
                return (
                  <div
                    key={point.hour}
                    className="stats-heat-cell"
                    style={{
                      backgroundColor:
                        intensity === 0
                          ? 'rgba(59, 130, 246, 0.08)'
                          : `rgba(59, 130, 246, ${0.16 + intensity * 0.66})`,
                    }}
                    title={`${String(point.hour).padStart(2, '0')}:00 • ${point.eventCount.toLocaleString()} events • ${point.totalTokens.toLocaleString()} tokens • ${point.sessionCount.toLocaleString()} sessions`}
                  >
                    <span>{String(point.hour).padStart(2, '0')}</span>
                    <strong>{point.eventCount.toLocaleString()}</strong>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="stats-grid-2">
            <article className="stats-section">
              <div className="stats-section-header">
                <h3>Models and reasoning effort</h3>
                <span className="stats-section-subtle">Token distribution</span>
              </div>
              {statsData.models.length === 0 ? (
                <p className="empty-copy">No model usage data yet.</p>
              ) : (
                <div className="stats-table-wrap">
                  <table className="stats-table">
                    <thead>
                      <tr>
                        <th>Model</th>
                        <th>Effort</th>
                        <th>Tokens</th>
                        <th>Sessions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statsData.models.map((model) => (
                        <tr key={`${model.model}::${model.reasoningEffort}`}>
                          <td>{model.model}</td>
                          <td>{model.reasoningEffort}</td>
                          <td>{model.totalTokens.toLocaleString()}</td>
                          <td>{model.sessionCount.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>

            <article className="stats-section">
              <div className="stats-section-header">
                <h3>Reasoning effort mix</h3>
                <span className="stats-section-subtle">Across all models</span>
              </div>
              {statsData.reasoningEfforts.length === 0 ? (
                <p className="empty-copy">No reasoning effort data yet.</p>
              ) : (
                <ul className="stats-top-list">
                  {statsData.reasoningEfforts.map((effort) => (
                    <li key={effort.reasoningEffort} className="stats-top-item">
                      <span>{effort.reasoningEffort}</span>
                      <span>{effort.totalTokens.toLocaleString()} tokens</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>
        </>
      )}
    </div>
  );
};
