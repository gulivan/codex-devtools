import type { RendererApi } from '@renderer/api';
import type { CodexChunk } from '@main/types';
import type { StateCreator } from 'zustand';

import type { AppState } from '../types';

export interface ConversationSlice {
  chunks: CodexChunk[];
  chunksSessionId: string | null;
  chunksLoading: boolean;
  chunksError: string | null;
  fetchChunks: (sessionId?: string) => Promise<void>;
  setChunks: (chunks: CodexChunk[]) => void;
}

export const createConversationSlice = (
  client: RendererApi,
): StateCreator<AppState, [], [], ConversationSlice> => (set, get) => ({
  chunks: [],
  chunksSessionId: null,
  chunksLoading: false,
  chunksError: null,

  fetchChunks: async (sessionId) => {
    const targetSessionId = sessionId ?? get().activeSessionId;
    if (!targetSessionId) {
      set({ chunks: [], chunksSessionId: null, chunksError: null, chunksLoading: false });
      return;
    }

    set({ chunksLoading: true, chunksError: null, chunksSessionId: targetSessionId });

    try {
      const chunks = await client.getSessionChunks(targetSessionId);
      set({
        chunks: chunks ?? [],
        chunksLoading: false,
      });
    } catch (error) {
      set({
        chunksLoading: false,
        chunksError: error instanceof Error ? error.message : 'Failed to fetch session chunks',
      });
    }
  },

  setChunks: (chunks) => {
    set({ chunks });
  },
});
