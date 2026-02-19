import { format } from 'date-fns';
import { isThisWeek, isToday, isYesterday } from 'date-fns';

import { useAppStore } from '@renderer/store';

import { SessionItem } from './SessionItem';

import type { CodexSession } from '@main/types';

interface SessionGroup {
  label: string;
  sessions: CodexSession[];
}

function getSessionDateGroup(value: string): string {
  const date = new Date(value);

  if (isToday(date)) {
    return 'Today';
  }

  if (isYesterday(date)) {
    return 'Yesterday';
  }

  if (isThisWeek(date, { weekStartsOn: 1 })) {
    return 'This Week';
  }

  return format(date, 'MMM d, yyyy');
}

function buildGroups(sessions: CodexSession[]): SessionGroup[] {
  const grouped = new Map<string, CodexSession[]>();

  for (const session of sessions) {
    const group = getSessionDateGroup(session.startTime);
    const items = grouped.get(group) ?? [];
    items.push(session);
    grouped.set(group, items);
  }

  return Array.from(grouped.entries()).map(([label, groupedSessions]) => ({
    label,
    sessions: groupedSessions,
  }));
}

export const DateGroupedSessions = (): JSX.Element => {
  const {
    sessions,
    sessionsLoading,
    activeSessionId,
    sessionPreviews,
    sessionUpdateBadges,
    searchQuery,
    selectSession,
  } = useAppStore((state) => ({
    sessions: state.sessions,
    sessionsLoading: state.sessionsLoading,
    activeSessionId: state.activeSessionId,
    sessionPreviews: state.sessionPreviews,
    sessionUpdateBadges: state.sessionUpdateBadges,
    searchQuery: state.searchQuery.trim().toLowerCase(),
    selectSession: state.selectSession,
  }));

  const filtered = sessions.filter((session) => {
    if (!searchQuery) {
      return true;
    }

    const preview = sessionPreviews[session.id] ?? '';
    const modelUsages = Array.isArray(session.modelUsages) ? session.modelUsages : [];
    const modelUsageHaystack = modelUsages
      .map((usage) => `${usage.model} ${usage.reasoningEffort}`)
      .join(' ');
    const haystack = `${session.model} ${modelUsageHaystack} ${session.id} ${preview}`.toLowerCase();
    return haystack.includes(searchQuery);
  });

  const groups = buildGroups(filtered);

  if (sessionsLoading) {
    return <div className="sidebar-loading">Loading sessions...</div>;
  }

  if (groups.length === 0) {
    return <div className="sidebar-empty">No sessions found for this project.</div>;
  }

  return (
    <div className="session-groups">
      {groups.map((group) => (
        <section key={group.label} className="session-group">
          <h2 className="session-group-title">{group.label}</h2>

          <div className="session-group-list">
            {group.sessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                isActive={session.id === activeSessionId}
                preview={sessionPreviews[session.id] ?? ''}
                hasUpdate={Boolean(sessionUpdateBadges[session.id])}
                onSelect={() => {
                  void selectSession(session.id);
                }}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};
