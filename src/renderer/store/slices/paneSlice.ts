import type { RendererApi } from '@renderer/api';
import type { StateCreator } from 'zustand';

import type { AppState } from '../types';

export interface PaneSlice {
  paneMode: 'single';
}

export const createPaneSlice = (
  _client: RendererApi,
): StateCreator<AppState, [], [], PaneSlice> => () => ({
  paneMode: 'single',
});
