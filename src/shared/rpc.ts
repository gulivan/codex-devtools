import type { CodexDevToolsConfig, CodexFileChangeEvent } from '@main/services/infrastructure';
import type { CodexParsedSession } from '@main/services/parsing';
import type {
  CodexAppUpdateStatus,
  CodexChunk,
  CodexProject,
  CodexSearchSessionsResult,
  CodexSession,
  CodexStatsScope,
  CodexStatsSummary,
} from '@main/types';

export interface CodexDevtoolsRpc {
  bun: {
    requests: {
      getProjects: {
        params: Record<string, never>;
        response: CodexProject[];
      };
      getSessions: {
        params: { projectCwd: string };
        response: CodexSession[];
      };
      getSessionDetail: {
        params: { sessionId: string };
        response: CodexParsedSession | null;
      };
      getSessionChunks: {
        params: { sessionId: string };
        response: CodexChunk[] | null;
      };
      getStats: {
        params: { scope?: CodexStatsScope };
        response: CodexStatsSummary;
      };
      searchSessions: {
        params: { query: string };
        response: CodexSearchSessionsResult;
      };
      getConfig: {
        params: Record<string, never>;
        response: CodexDevToolsConfig;
      };
      updateConfig: {
        params: {
          key: keyof CodexDevToolsConfig;
          value: unknown;
        };
        response: CodexDevToolsConfig | null;
      };
      getAppVersion: {
        params: Record<string, never>;
        response: string;
      };
      checkAppUpdate: {
        params: Record<string, never>;
        response: CodexAppUpdateStatus;
      };
    };
    messages: Record<string, never>;
  };
  webview: {
    requests: Record<string, never>;
    messages: {
      fileChange: CodexFileChangeEvent;
    };
  };
}
