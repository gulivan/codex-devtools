import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api } from '@renderer/api';
import { InstallationPanel, StatsPanel, TracePanel, type InstallationTab } from './Panels';

import type {
  InstallationResult,
  InspectorSession,
  StatsQuery,
  StatsResult,
  TraceKind,
  TraceQuery,
  TraceResult,
} from '@shared/inspector';

type InspectorSection = 'trace' | 'stats' | 'installation';

const SECTIONS: { id: InspectorSection; label: string }[] = [
  { id: 'trace', label: 'Trace' },
  { id: 'stats', label: 'Stats' },
  { id: 'installation', label: 'Installation' },
];

async function copyToClipboard(value: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    window.setTimeout(() => window.alert(label), 0);
  } catch {
    // Clipboard access can be blocked; stay silent.
  }
}

const inspectorSessionLabel = (session: InspectorSession): string => {
  const project = session.cwd.split(/[\\/]/).filter(Boolean).pop() || 'Project';
  const title = session.title?.trim() || session.id.slice(0, 8);
  const date = new Date(session.startTime);
  const stamp = Number.isNaN(date.getTime())
    ? ''
    : ` · ${date.toLocaleDateString('en', { month: 'short', day: 'numeric' })}`;
  return `${project} — ${title}${stamp}`;
};

const rangeToFrom = (range: string): string | undefined => {
  if (range === 'all') {
    return undefined;
  }

  const days = Number(range);
  if (!Number.isFinite(days)) {
    return undefined;
  }

  return new Date(Date.now() - days * 86_400_000).toISOString();
};

export const InspectorView = (): JSX.Element => {
  const [section, setSection] = useState<InspectorSection>('trace');

  return (
    <div className="cx-root">
      <nav className="cx-view-tabs" aria-label="Inspector sections">
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={section === item.id ? 'is-active' : ''}
            aria-pressed={section === item.id}
            onClick={() => setSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {section === 'trace' ? <TraceSection /> : null}
      {section === 'stats' ? <StatsSection /> : null}
      {section === 'installation' ? <InstallationSection /> : null}
    </div>
  );
};

function TraceSection(): JSX.Element {
  const [sessions, setSessions] = useState<InspectorSession[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [kind, setKind] = useState<TraceKind | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [trace, setTrace] = useState<TraceResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInspector, setShowInspector] = useState(true);
  const requestId = useRef(0);

  const loadSessions = useCallback(async (selectFirst: boolean) => {
    const list = await api.getInspectorSessions();
    setSessions(list);
    if (selectFirst && list.length > 0) {
      setSessionId((current) => current || list[0].id);
    }
  }, []);

  useEffect(() => {
    void loadSessions(true);
    return api.onFileChange(() => {
      void loadSessions(false);
    });
  }, [loadSessions]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!sessionId) {
      setTrace(null);
      setLoading(false);
      return;
    }

    const query: TraceQuery = { sessionId, kind: kind || undefined, search: search || undefined, offset, limit: 100 };
    const current = ++requestId.current;
    setLoading(true);
    void api
      .getInspectorTrace(query)
      .then((result) => {
        if (requestId.current !== current) {
          return;
        }
        setTrace(result);
        setLoading(false);
      })
      .catch(() => {
        if (requestId.current !== current) {
          return;
        }
        setTrace(null);
        setLoading(false);
      });
  }, [sessionId, kind, search, offset]);

  useEffect(() => {
    setOffset(0);
    setExpanded(new Set());
  }, [sessionId, kind, search]);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === sessionId) ?? trace?.session ?? null,
    [sessions, sessionId, trace],
  );

  return (
    <div className="cx-trace-section">
      <div className="cx-picker-row">
        <label className="cx-session-picker">
          <span>Session</span>
          <select
            aria-label="Inspect session"
            value={sessionId}
            onChange={(event) => setSessionId(event.target.value)}
          >
            <option value="" disabled>
              {sessions.length ? 'Choose a session…' : 'No sessions found'}
            </option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {inspectorSessionLabel(session)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="cx-button"
          onClick={() => {
            void loadSessions(false);
          }}
        >
          Refresh
        </button>
      </div>
      <div className="cx-trace-host">
        <TracePanel
          session={selectedSession ?? undefined}
          trace={trace}
          kind={kind}
          search={searchInput}
          expanded={expanded}
          loading={loading}
          showInspector={showInspector}
          onKind={(value) => setKind(value)}
          onSearch={(value) => setSearchInput(value)}
          onExpand={(id) => {
            setExpanded((current) => {
              const next = new Set(current);
              if (next.has(id)) {
                next.delete(id);
              } else {
                next.add(id);
              }
              return next;
            });
          }}
          onPage={(nextOffset) => setOffset(nextOffset)}
          onCopy={(value, label) => {
            void copyToClipboard(value, label);
          }}
          onToggleInspector={() => setShowInspector((current) => !current)}
        />
      </div>
    </div>
  );
}

function StatsSection(): JSX.Element {
  const [stats, setStats] = useState<StatsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [model, setModel] = useState('');
  const [range, setRange] = useState('30');
  const [bucket, setBucket] = useState('day');
  const [group, setGroup] = useState(false);
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const requestId = useRef(0);

  useEffect(() => {
    const query: StatsQuery = {
      model: model || undefined,
      from: rangeToFrom(range),
      to: new Date().toISOString(),
      bucket: bucket as StatsQuery['bucket'],
      timezone,
      groupByModel: group,
    };
    const current = ++requestId.current;
    setLoading(true);
    void api
      .getInspectorStats(query)
      .then((result) => {
        if (requestId.current !== current) {
          return;
        }
        setStats(result);
        setLoading(false);
      })
      .catch(() => {
        if (requestId.current !== current) {
          return;
        }
        setStats(null);
        setLoading(false);
      });
  }, [model, range, bucket, group, timezone]);

  const exportCsv = useCallback(() => {
    if (!stats) {
      return;
    }

    const header = 'series,key,cached_input,uncached_input,output,known_price_usd,unpriced_tokens';
    const lines = stats.series.flatMap((series) =>
      series.points.map(
        (point) =>
          [
            series.model,
            point.key,
            point.cached,
            point.input,
            point.output,
            point.price ?? '',
            point.unpricedTokens,
          ].join(','),
      ),
    );
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'codex-inspector-usage.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }, [stats]);

  return (
    <StatsPanel
      stats={stats}
      loading={loading}
      model={model}
      range={range}
      bucket={bucket}
      group={group}
      timezone={timezone}
      onChange={(key, value) => {
        if (key === 'model') setModel(value);
        if (key === 'range') setRange(value);
        if (key === 'bucket') setBucket(value);
        if (key === 'timezone') setTimezone(value);
      }}
      onGroup={setGroup}
      onExport={() => {
        exportCsv();
      }}
    />
  );
}

function InstallationSection(): JSX.Element {
  const [installation, setInstallation] = useState<InstallationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<InstallationTab>('settings');
  const [search, setSearch] = useState('');
  const requestId = useRef(0);

  const load = useCallback(() => {
    const current = ++requestId.current;
    setLoading(true);
    void api
      .getInspectorInstallation()
      .then((result) => {
        if (requestId.current !== current) {
          return;
        }
        setInstallation(result);
        setLoading(false);
      })
      .catch(() => {
        if (requestId.current !== current) {
          return;
        }
        setInstallation(null);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <InstallationPanel
      installation={installation}
      loading={loading}
      tab={tab}
      search={search}
      onTab={setTab}
      onSearch={setSearch}
      onRefresh={load}
    />
  );
}
