import type { CodexDevToolsConfig, CodexFileChangeEvent } from '@main/services/infrastructure';
import type { CodexParsedSession } from '@main/services/parsing';
import type {
  InstallationResult,
  InspectorSession,
  StatsQuery,
  StatsResult,
  TraceQuery,
  TraceResult,
} from '@shared/inspector';
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
      getInspectorSessions: {
        params: Record<string, never>;
        response: InspectorSession[];
      };
      getInspectorTrace: {
        params: { query: TraceQuery };
        response: TraceResult | null;
      };
      getInspectorStats: {
        params: { query: StatsQuery };
        response: StatsResult | null;
      };
      getInspectorInstallation: {
        params: { cwd?: string };
        response: InstallationResult | null;
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
