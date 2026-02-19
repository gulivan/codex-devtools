import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { Sidebar } from '@renderer/components/layout/Sidebar';

import type { CodexProject, CodexSession } from '@main/types';

interface MockStoreState {
  projects: CodexProject[];
  projectsLoading: boolean;
  activeProjectCwd: string | null;
  fetchProjects: () => Promise<void>;
  selectProject: (cwd: string) => Promise<void>;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  sessions: CodexSession[];
  sessionsLoading: boolean;
  activeSessionId: string | null;
  sessionPreviews: Record<string, string>;
  selectSession: (sessionId: string) => Promise<void>;
}

const { mockUseAppStore } = vi.hoisted(() => ({
  mockUseAppStore: vi.fn(),
}));

vi.mock('@renderer/store', () => ({
  useAppStore: mockUseAppStore,
}));

let storeState: MockStoreState;

describe('Sidebar', () => {
  beforeEach(() => {
    storeState = {
      projects: [
        {
          cwd: '/workspace/team-a/app',
          name: 'app',
          sessionCount: 3,
          lastActivity: '2026-02-18T11:00:00.000Z',
        },
        {
          cwd: '/workspace/team-b/app',
          name: 'app',
          sessionCount: 1,
          lastActivity: '2026-02-18T12:00:00.000Z',
        },
      ],
      projectsLoading: false,
      activeProjectCwd: '/workspace/team-a/app',
      fetchProjects: vi.fn(async () => undefined),
      selectProject: vi.fn(async (_cwd: string) => undefined),
      searchQuery: '',
      setSearchQuery: vi.fn(),
      sessions: [],
      sessionsLoading: false,
      activeSessionId: null,
      sessionPreviews: {},
      selectSession: vi.fn(async (_sessionId: string) => undefined),
    };

    mockUseAppStore.mockImplementation(<T>(selector: (state: MockStoreState) => T) => selector(storeState));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockUseAppStore.mockReset();
  });

  it('renders full project CWD in project selector options', () => {
    const html = renderToStaticMarkup(createElement(Sidebar));

    expect(html).toContain('app - /workspace/team-a/app (3)');
    expect(html).toContain('app - /workspace/team-b/app (1)');
  });
});
