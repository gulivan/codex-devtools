import type { ConversationSlice } from './slices/conversationSlice';
import type { ConfigSlice } from './slices/configSlice';
import type { PaneSlice } from './slices/paneSlice';
import type { ProjectSlice } from './slices/projectSlice';
import type { SessionSlice } from './slices/sessionSlice';
import type { StatsSlice } from './slices/statsSlice';
import type { TabSlice } from './slices/tabSlice';
import type { UISlice } from './slices/uiSlice';

export type AppTabType = 'dashboard' | 'session' | 'settings' | 'stats';

export interface AppTab {
  id: string;
  type: AppTabType;
  label: string;
  sessionId?: string;
}

export type AppState =
  & ProjectSlice
  & SessionSlice
  & ConversationSlice
  & ConfigSlice
  & TabSlice
  & StatsSlice
  & PaneSlice
  & UISlice;
