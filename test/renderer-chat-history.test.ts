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

import {
  ChatHistory,
  getChatScrollDisposition,
  isChatScrolledNearBottom,
} from '@renderer/components/chat/ChatHistory';
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

describe('chat scroll behavior', () => {
  function createScrollContainer(values: {
    scrollHeight: number;
    scrollTop: number;
    clientHeight: number;
  }): HTMLElement {
    return values as HTMLElement;
  }

  it('only treats the chat as bottom-pinned when it is within the follow threshold', () => {
    expect(
      isChatScrolledNearBottom(
        createScrollContainer({
          scrollHeight: 1_000,
          scrollTop: 452,
          clientHeight: 500,
        }),
      ),
    ).toBe(true);

    expect(
      isChatScrolledNearBottom(
        createScrollContainer({
          scrollHeight: 1_000,
          scrollTop: 300,
          clientHeight: 500,
        }),
      ),
    ).toBe(false);
  });

  it('does not treat initial session load as a new-message append', () => {
    expect(
      getChatScrollDisposition({
        previousChunkCount: 0,
        nextChunkCount: 15,
        wasBottomPinned: false,
        isSameSession: true,
      }),
    ).toEqual({
      shouldScrollToBottom: false,
      shouldShowNewMessagesIndicator: false,
    });
  });

  it('follows appended messages only while bottom-pinned', () => {
    expect(
      getChatScrollDisposition({
        previousChunkCount: 2,
        nextChunkCount: 3,
        wasBottomPinned: true,
        isSameSession: true,
      }),
    ).toEqual({
      shouldScrollToBottom: true,
      shouldShowNewMessagesIndicator: false,
    });
  });

  it('shows the new-message indicator when messages append while scrolled up', () => {
    expect(
      getChatScrollDisposition({
        previousChunkCount: 2,
        nextChunkCount: 3,
        wasBottomPinned: false,
        isSameSession: true,
      }),
    ).toEqual({
      shouldScrollToBottom: false,
      shouldShowNewMessagesIndicator: true,
    });
  });
});
