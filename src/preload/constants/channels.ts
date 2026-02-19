export const IPC_CHANNELS = {
  SESSIONS_GET_PROJECTS: 'get-projects',
  SESSIONS_GET_SESSIONS: 'get-sessions',
  SESSIONS_GET_DETAIL: 'get-session-detail',
  SESSIONS_GET_CHUNKS: 'get-session-chunks',
  SEARCH_SESSIONS: 'search-sessions',
  CONFIG_GET: 'config:get',
  CONFIG_UPDATE: 'config:update',
  UTILITY_GET_APP_VERSION: 'get-app-version',
  EVENTS_FILE_CHANGE: 'file-change',
} as const;
