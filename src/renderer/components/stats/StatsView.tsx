import { useEffect, useMemo, useState } from 'react';

import { useAppStore } from '@renderer/store';

import type { CodexStatsDailyPoint, CodexStatsScope } from '@main/types';

const CONTRIBUTION_WEEKDAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

type ContributionLevel = 0 | 1 | 2 | 3 | 4;
type CalendarMetric = 'totalTokens' | 'inputTokens' | 'outputTokens' | 'eventCount' | 'sessionCount';

const CALENDAR_METRIC_OPTIONS: Array<{ value: CalendarMetric; label: string; tooltipLabel: string }> = [
  { value: 'totalTokens', label: 'Total tokens', tooltipLabel: 'total tokens' },
  { value: 'inputTokens', label: 'Input tokens', tooltipLabel: 'input tokens' },
  { value: 'outputTokens', label: 'Output tokens', tooltipLabel: 'output tokens' },
  { value: 'eventCount', label: 'Events', tooltipLabel: 'events' },
  { value: 'sessionCount', label: 'Sessions', tooltipLabel: 'sessions' },
];

interface DailyContributionCell {
  date: string;
  metricValue: number;
  level: ContributionLevel;
  inRange: boolean;
}

interface DailyContributionGrid {
  weeks: DailyContributionCell[][];
  months: Array<{
    key: string;
    label: string;
    weekIndex: number;
  }>;
}

interface ContributionTooltipState {
  text: string;
  x: number;
  y: number;
}

function normalizeScope(scope: CodexStatsScope): CodexStatsScope {
  if (scope.type === 'project' && scope.cwd.trim().length > 0) {
    return { type: 'project', cwd: scope.cwd.trim() };
  }

  return { type: 'all' };
}

function parseDateKey(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getContributionLevel(outputTokens: number, maxOutputTokens: number): ContributionLevel {
  if (!Number.isFinite(outputTokens) || outputTokens <= 0 || maxOutputTokens <= 0) {
    return 0;
  }

  const normalized = Math.log(outputTokens + 1) / Math.log(maxOutputTokens + 1);
  if (normalized < 0.25) {
    return 1;
  }

  if (normalized < 0.5) {
    return 2;
  }

  if (normalized < 0.75) {
    return 3;
  }

  return 4;
}

function getDailyMetricValue(point: CodexStatsDailyPoint | undefined, metric: CalendarMetric): number {
  if (!point) {
    return 0;
  }

  switch (metric) {
    case 'totalTokens':
      return point.totalTokens;
    case 'inputTokens':
      return point.inputTokens;
    case 'outputTokens':
      return point.outputTokens;
    case 'eventCount':
      return point.eventCount;
    case 'sessionCount':
      return point.sessionCount;
    default:
      return 0;
  }
}

function buildDailyContributionGrid(daily: CodexStatsDailyPoint[], metric: CalendarMetric): DailyContributionGrid {
  if (daily.length === 0) {
    return {
      weeks: [],
      months: [],
    };
  }

  const sorted = [...daily].sort((left, right) => left.date.localeCompare(right.date));
  const valuesByDate = new Map(sorted.map((point) => [point.date, point]));
  const maxMetricValue = Math.max(...sorted.map((point) => getDailyMetricValue(point, metric)), 0);

  const firstDate = parseDateKey(sorted[0].date);
  const lastDate = parseDateKey(sorted[sorted.length - 1].date);

  const paddedStart = new Date(firstDate);
  paddedStart.setDate(paddedStart.getDate() - paddedStart.getDay());

  const paddedEnd = new Date(lastDate);
  paddedEnd.setDate(paddedEnd.getDate() + (6 - paddedEnd.getDay()));

  const weeks: DailyContributionCell[][] = [];
  const cursor = new Date(paddedStart);
  while (cursor <= paddedEnd) {
    const week: DailyContributionCell[] = [];
    for (let offset = 0; offset < 7; offset += 1) {
      const date = formatDateKey(cursor);
      const point = valuesByDate.get(date);
      const inRange = cursor >= firstDate && cursor <= lastDate;
      const metricValue = getDailyMetricValue(point, metric);

      week.push({
        date,
        metricValue,
        level: getContributionLevel(metricValue, maxMetricValue),
        inRange,
      });

      cursor.setDate(cursor.getDate() + 1);
    }

    weeks.push(week);
  }

  const months: DailyContributionGrid['months'] = [];
  let previousMonthKey = '';
  weeks.forEach((week, weekIndex) => {
    const monthStartCell = week.find((cell) => cell.inRange && cell.date.endsWith('-01'));
    const anchor = monthStartCell ?? week.find((cell) => cell.inRange);
    if (!anchor) {
      return;
    }

    const monthDate = parseDateKey(anchor.date);
    const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
    if (monthKey === previousMonthKey) {
      return;
    }

    months.push({
      key: monthKey,
      label: monthDate.toLocaleString(undefined, { month: 'short' }),
      weekIndex,
    });
    previousMonthKey = monthKey;
  });

  return {
    weeks,
    months,
  };
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
  const [calendarMetric, setCalendarMetric] = useState<CalendarMetric>('outputTokens');
  const [contributionTooltip, setContributionTooltip] = useState<ContributionTooltipState | null>(null);

  useEffect(() => {
    if (!statsData && !statsLoading) {
      void fetchStats(statsScope);
    }
  }, [statsData, statsLoading, fetchStats, statsScope]);

  const dailyMaxOutput = useMemo(
    () => Math.max(...(statsData?.daily.map((point) => point.outputTokens) ?? [0])),
    [statsData],
  );

  const hourlyMaxEvents = useMemo(
    () => Math.max(...(statsData?.hourly.map((point) => point.eventCount) ?? [1])),
    [statsData],
  );

  const dailyContributionGrid = useMemo(
    () => buildDailyContributionGrid(statsData?.daily ?? [], calendarMetric),
    [statsData, calendarMetric],
  );

  const selectedCalendarMetricOption = useMemo(
    () => CALENDAR_METRIC_OPTIONS.find((option) => option.value === calendarMetric) ?? CALENDAR_METRIC_OPTIONS[2],
    [calendarMetric],
  );

  useEffect(() => {
    setContributionTooltip(null);
  }, [calendarMetric, statsData]);
  const uncachedInputTokens = useMemo(
    () => Math.max((statsData?.totals.inputTokens ?? 0) - (statsData?.totals.cachedTokens ?? 0), 0),
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
            <article
              className="stat-card"
              title={`Cached: ${statsData.totals.cachedTokens.toLocaleString()} | Uncached: ${uncachedInputTokens.toLocaleString()}`}
            >
              <span className="stat-label">In</span>
              <strong className="stat-value">{statsData.totals.inputTokens.toLocaleString()}</strong>
            </article>
            <article className="stat-card">
              <span className="stat-label">Out</span>
              <strong className="stat-value">{statsData.totals.outputTokens.toLocaleString()}</strong>
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
                  const rawWidthPercent = dailyMaxOutput > 0 ? (point.outputTokens / dailyMaxOutput) * 100 : 0;
                  const widthPercent = Number.isFinite(rawWidthPercent)
                    ? Math.max(0, Math.min(100, rawWidthPercent))
                    : 0;
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

          <section className="stats-section">
            <div className="stats-section-header">
              <h3>Output calendar</h3>
              <div className="stats-section-header-actions">
                <label className="sidebar-label" htmlFor="stats-calendar-metric">
                  Type
                </label>
                <select
                  id="stats-calendar-metric"
                  className="app-select stats-contrib-select"
                  value={calendarMetric}
                  onChange={(event) => {
                    setCalendarMetric(event.target.value as CalendarMetric);
                  }}
                >
                  {CALENDAR_METRIC_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {dailyContributionGrid.weeks.length === 0 ? (
              <p className="empty-copy">No daily token data yet.</p>
            ) : (
              <div className="stats-contrib-frame">
                <div className="stats-contrib-weekdays">
                  {CONTRIBUTION_WEEKDAY_LABELS.map((label, index) => (
                    <span key={`contrib-weekday-${index}`}>{label}</span>
                  ))}
                </div>

                <div className="stats-contrib-scroll">
                  <div
                    className="stats-contrib-months"
                    style={{ gridTemplateColumns: `repeat(${dailyContributionGrid.weeks.length}, 12px)` }}
                  >
                    {dailyContributionGrid.months.map((month) => (
                      <span
                        key={month.key}
                        className="stats-contrib-month"
                        style={{ gridColumn: String(month.weekIndex + 1) }}
                      >
                        {month.label}
                      </span>
                    ))}
                  </div>

                  <div
                    className="stats-contrib-weeks"
                    role="img"
                    aria-label="Daily output tokens calendar heatmap"
                  >
                    {dailyContributionGrid.weeks.map((week, weekIndex) => (
                      <div key={`week-${weekIndex}`} className="stats-contrib-week">
                        {week.map((cell) => {
                          const tooltipText = `${cell.date} • ${cell.metricValue.toLocaleString()} ${selectedCalendarMetricOption.tooltipLabel}`;

                          return (
                            <div
                              key={cell.date}
                              className={`stats-contrib-cell level-${cell.level}${!cell.inRange ? ' is-padding' : ''}${cell.inRange && cell.level === 0 ? ' is-empty' : ''}`}
                              title={cell.inRange ? tooltipText : undefined}
                              aria-label={cell.inRange ? tooltipText : undefined}
                              tabIndex={cell.inRange ? 0 : -1}
                              onMouseEnter={(event) => {
                                if (!cell.inRange) {
                                  return;
                                }

                                setContributionTooltip({
                                  text: tooltipText,
                                  x: event.clientX,
                                  y: event.clientY,
                                });
                              }}
                              onMouseMove={(event) => {
                                if (!cell.inRange) {
                                  return;
                                }

                                setContributionTooltip({
                                  text: tooltipText,
                                  x: event.clientX,
                                  y: event.clientY,
                                });
                              }}
                              onMouseLeave={() => {
                                setContributionTooltip(null);
                              }}
                              onFocus={(event) => {
                                if (!cell.inRange) {
                                  return;
                                }

                                const rect = event.currentTarget.getBoundingClientRect();
                                setContributionTooltip({
                                  text: tooltipText,
                                  x: rect.left + rect.width / 2,
                                  y: rect.bottom + 4,
                                });
                              }}
                              onBlur={() => {
                                setContributionTooltip(null);
                              }}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {contributionTooltip ? (
              <div
                className="stats-contrib-tooltip"
                role="tooltip"
                style={{
                  left: `${contributionTooltip.x + 12}px`,
                  top: `${contributionTooltip.y + 12}px`,
                }}
              >
                {contributionTooltip.text}
              </div>
            ) : null}
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
