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

  it('does not render NaN widths when daily output tokens are zero', () => {
    const html = renderToStaticMarkup(createElement(StatsView));
    expect(html).not.toContain('NaN%');
    expect(html).toContain('width:6%');
  });
});
