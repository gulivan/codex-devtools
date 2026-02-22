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
import { parseStreamArtifactContent } from '@renderer/components/chat/items/StreamArtifactItem';

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

  it('renders codex stream artifact lines as structured stream cards', () => {
    mockStoreState.chunks = [
      {
        type: 'system',
        content: '{"timestamp":"2026-02-22T22:00:01.700Z","engine":"codex","agent":"reviewer-codex","event_type":"thread.started","provider_thread_id":"abc-123","payload":{"type":"thread.started"},"stage_id":"qa-stage"}',
        timestamp: '2026-02-22T22:00:01.700Z',
      },
    ];

    const html = renderToStaticMarkup(createElement(ChatHistory, { sessionId: 'session-stream' }));

    expect(html).toContain('stream-artifact');
    expect(html).toContain('Stream events');
    expect(html).toContain('thread.started');
    expect(html).toContain('reviewer-codex');
    expect(html).not.toContain('chat-system-message');
  });
});

describe('stream artifact parsing', () => {
  it('parses valid stream artifact jsonl content', () => {
    const parsed = parseStreamArtifactContent(
      '{"timestamp":"2026-02-22T22:00:01.700Z","engine":"codex","agent":"reviewer-codex","event_type":"turn.started","payload":{"type":"turn.started"}}\n' +
      '{"timestamp":"2026-02-22T22:00:02.100Z","engine":"codex","agent":"reviewer-codex","event_type":"turn.completed","payload":{"type":"turn.completed"}}',
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.length).toBe(2);
    expect(parsed?.[0]?.eventType).toBe('turn.started');
  });

  it('returns null when content is not stream artifact jsonl', () => {
    expect(parseStreamArtifactContent('not-json')).toBeNull();
    expect(parseStreamArtifactContent('{"foo":"bar"}')).toBeNull();
  });
});
