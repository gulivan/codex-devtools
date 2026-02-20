import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { CodexChunk } from '@main/types';

const { mockStoreState } = vi.hoisted(() => ({
  mockStoreState: {
    chunks: [] as CodexChunk[],
    chunksLoading: false,
    chunksSessionId: undefined as string | undefined,
    sessions: [] as unknown[],
  },
}));

vi.mock('@renderer/store', () => ({
  useAppStore: (selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState),
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: () => ({
    getVirtualItems: () =>
      mockStoreState.chunks.map((_, index) => ({
        index,
        start: index * 180,
      })),
    getTotalSize: () => Math.max(180, mockStoreState.chunks.length * 180),
    measure: () => undefined,
    measureElement: () => undefined,
  }),
}));

import { ChatHistory } from '@renderer/components/chat/ChatHistory';

describe('ChatHistory system prelude rendering', () => {
  beforeEach(() => {
    mockStoreState.chunks = [];
    mockStoreState.chunksLoading = false;
    mockStoreState.chunksSessionId = undefined;
    mockStoreState.sessions = [];
  });

  it('renders system preludes with a button summary instead of native details', () => {
    mockStoreState.chunks = [
      {
        type: 'system',
        content: '<environment_context>\n  <cwd>/tmp/project</cwd>\n  <shell>zsh</shell>\n</environment_context>',
        timestamp: '2026-02-20T00:00:00.000Z',
      },
    ];

    const html = renderToStaticMarkup(createElement(ChatHistory, { sessionId: 'session-1' }));

    expect(html).toContain('chat-system-prelude environment_context');
    expect(html).toContain('chat-system-prelude-summary');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('<details');
  });
});
