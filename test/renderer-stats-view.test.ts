import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { CodexStatsSummary } from '@main/types';

const { mockStoreState } = vi.hoisted(() => ({
  mockStoreState: {
    projects: [] as Array<{ cwd: string; name: string }>,
    statsData: null as CodexStatsSummary | null,
    statsScope: { type: 'all' } as { type: 'all' } | { type: 'project'; cwd: string },
    statsLoading: false,
    statsError: null as string | null,
    fetchStats: vi.fn(async () => undefined),
    setStatsScope: vi.fn(async () => undefined),
  },
}));

vi.mock('@renderer/store', () => ({
  useAppStore: (selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState),
}));

import { StatsView } from '@renderer/components/stats/StatsView';

function createStatsWithZeroDailyOutput(): CodexStatsSummary {
  return {
    generatedAt: '2026-02-18T00:00:00.000Z',
    timezone: 'UTC',
    scope: { type: 'all' },
    totals: {
      sessions: 1,
      archivedSessions: 0,
      eventCount: 1,
      durationMs: 60_000,
      estimatedCostUsd: 0,
      totalTokens: 10,
      inputTokens: 10,
      outputTokens: 0,
      cachedTokens: 0,
      reasoningTokens: 0,
    },
    daily: [
      {
        date: '2026-02-18',
        eventCount: 1,
        sessionCount: 1,
        totalTokens: 10,
        inputTokens: 10,
        outputTokens: 0,
        cachedTokens: 0,
        reasoningTokens: 0,
      },
    ],
    hourly: [
      {
        hour: 0,
        eventCount: 1,
        sessionCount: 1,
        totalTokens: 10,
        inputTokens: 10,
        outputTokens: 0,
        cachedTokens: 0,
        reasoningTokens: 0,
      },
    ],
    topDays: [],
    topHours: [],
    models: [],
    reasoningEfforts: [],
    costCoverage: {
      pricedTokens: 0,
      unpricedTokens: 10,
      unpricedModels: ['gpt-5'],
    },
    rates: {
      updatedAt: null,
      source: null,
    },
  };
}

describe('StatsView', () => {
  beforeEach(() => {
    mockStoreState.projects = [{ cwd: '/repo/a', name: 'a' }];
    mockStoreState.statsScope = { type: 'all' };
    mockStoreState.statsData = createStatsWithZeroDailyOutput();
    mockStoreState.statsLoading = false;
    mockStoreState.statsError = null;
    mockStoreState.fetchStats.mockClear();
    mockStoreState.setStatsScope.mockClear();
  });

  it('renders zero width bars when daily output tokens are zero', () => {
    const html = renderToStaticMarkup(createElement(StatsView));
    expect(html).not.toContain('NaN%');
    expect(html).toContain('width:0%');
  });

  it('renders output calendar in a separate section without legend text', () => {
    const html = renderToStaticMarkup(createElement(StatsView));
    expect(html).toContain('<span class="stat-label">Total tokens</span>');
    expect(html).toContain('<span class="stat-label">In</span>');
    expect(html).toContain('<span class="stat-label">Out</span>');
    expect(html).toContain('title="Cached: 0 | Uncached: 10"');
    expect(html).not.toContain('Input tokens (all)');
    expect(html).not.toContain('Input tokens (uncached)');
    expect(html).not.toContain('Input tokens (cached)');
    expect(html).not.toContain('Uncached + output');
    expect(html).not.toContain('<span class="stat-label">Sessions</span>');
    expect(html).not.toContain('<span class="stat-label">Active time</span>');
    expect(html).toContain('Output calendar');
    expect(html).toContain('stats-calendar-metric');
    expect(html).toContain('Total tokens');
    expect(html).toContain('Input tokens');
    expect(html).toContain('Output tokens');
    expect(html).toContain('Events');
    expect(html).toContain('Sessions');
    expect(html).not.toContain('Hover a square to see its value.');
    expect(html).not.toContain('GitHub-style output calendar');
    expect(html).not.toContain('Contribution intensity legend');
    expect(html).not.toContain('1 weeks');
    expect(html).toContain('stats-contrib-cell level-0 is-empty');
    expect(html).toContain('2026-02-18 • 0 output tokens');
  });
});
