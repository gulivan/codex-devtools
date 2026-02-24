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
import type { CodexDevtoolsRpc } from '@shared/rpc';

export interface RendererApi {
  getProjects: () => Promise<CodexProject[]>;
  getSessions: (projectCwd: string) => Promise<CodexSession[]>;
  getSessionDetail: (sessionId: string) => Promise<CodexParsedSession | null>;
  getSessionChunks: (sessionId: string) => Promise<CodexChunk[] | null>;
  getStats: (scope?: CodexStatsScope) => Promise<CodexStatsSummary>;
  searchSessions: (query: string) => Promise<CodexSearchSessionsResult>;
  getConfig: () => Promise<CodexDevToolsConfig>;
  updateConfig: (key: keyof CodexDevToolsConfig, value: unknown) => Promise<CodexDevToolsConfig | null>;
  getAppVersion: () => Promise<string>;
  checkAppUpdate: () => Promise<CodexAppUpdateStatus>;
  onFileChange: (callback: (event: CodexFileChangeEvent) => void) => () => void;
}

interface EventSourceLike {
  addEventListener: (type: string, listener: (event: MessageEvent) => void) => void;
  removeEventListener: (type: string, listener: (event: MessageEvent) => void) => void;
  close?: () => void;
}

interface HttpApiOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  eventSourceFactory?: (url: string) => EventSourceLike;
}

type ElectroviewRequests = CodexDevtoolsRpc['bun']['requests'];
type ElectroviewMessages = CodexDevtoolsRpc['webview']['messages'];

interface ElectroviewRpc {
  request: {
    [K in keyof ElectroviewRequests]: (
      params: ElectroviewRequests[K]['params'],
    ) => Promise<ElectroviewRequests[K]['response']>;
  };
  addMessageListener: (
    message: keyof ElectroviewMessages | '*',
    listener: (...args: unknown[]) => void,
  ) => void;
  removeMessageListener: (
    message: keyof ElectroviewMessages | '*',
    listener: (...args: unknown[]) => void,
  ) => void;
}

function getHttpBaseUrl(): string {
  if (typeof window === 'undefined') {
    return 'http://127.0.0.1:3456';
  }

  const params = new URLSearchParams(window.location.search);
  const explicitPort = params.get('port');
  if (explicitPort) {
    return `http://127.0.0.1:${Number.parseInt(explicitPort, 10)}`;
  }

  return window.location.origin;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `HTTP ${response.status}`);
  }

  if (!text) {
    return null as T;
  }

  return JSON.parse(text) as T;
}

class HttpApiClient implements RendererApi {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly eventSourceFactory?: (url: string) => EventSourceLike;
  private eventSource: EventSourceLike | null = null;

  constructor(options: HttpApiOptions) {
    this.baseUrl = options.baseUrl;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.eventSourceFactory = options.eventSourceFactory;
  }

  async getProjects(): Promise<CodexProject[]> {
    return this.get<CodexProject[]>('/projects');
  }

  async getSessions(projectCwd: string): Promise<CodexSession[]> {
    return this.get<CodexSession[]>(`/projects/${encodeURIComponent(projectCwd)}/sessions`);
  }

  async getSessionDetail(sessionId: string): Promise<CodexParsedSession | null> {
    return this.get<CodexParsedSession | null>(`/sessions/${encodeURIComponent(sessionId)}`);
  }

  async getSessionChunks(sessionId: string): Promise<CodexChunk[] | null> {
    return this.get<CodexChunk[] | null>(`/sessions/${encodeURIComponent(sessionId)}/chunks`);
  }

  async getStats(scope: CodexStatsScope = { type: 'all' }): Promise<CodexStatsSummary> {
    if (scope.type === 'project') {
      return this.get<CodexStatsSummary>(`/stats?scope=project&cwd=${encodeURIComponent(scope.cwd)}`);
    }

    return this.get<CodexStatsSummary>('/stats?scope=all');
  }

  async searchSessions(query: string): Promise<CodexSearchSessionsResult> {
    return this.get<CodexSearchSessionsResult>(`/search?q=${encodeURIComponent(query)}`);
  }

  async getConfig(): Promise<CodexDevToolsConfig> {
    return this.get<CodexDevToolsConfig>('/config');
  }

  async updateConfig(
    key: keyof CodexDevToolsConfig,
    value: unknown,
  ): Promise<CodexDevToolsConfig | null> {
    return this.put<CodexDevToolsConfig | null>('/config', { key, value });
  }

  async getAppVersion(): Promise<string> {
    const response = await this.fetchImpl(`${this.baseUrl}/version`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.text();
  }

  async checkAppUpdate(): Promise<CodexAppUpdateStatus> {
    return this.get<CodexAppUpdateStatus>('/app-update');
  }

  onFileChange(callback: (event: CodexFileChangeEvent) => void): () => void {
    const eventSource = this.getEventSource();
    if (!eventSource) {
      return () => undefined;
    }

    const handler = (event: MessageEvent): void => {
      try {
        callback(JSON.parse(event.data as string) as CodexFileChangeEvent);
      } catch {
        // Ignore malformed events.
      }
    };

    eventSource.addEventListener('file-change', handler);
    return (): void => {
      eventSource.removeEventListener('file-change', handler);
    };
  }

  private getEventSource(): EventSourceLike | null {
    if (this.eventSource) {
      return this.eventSource;
    }

    if (!this.eventSourceFactory && typeof EventSource === 'undefined') {
      return null;
    }

    const factory = this.eventSourceFactory ?? ((url: string): EventSourceLike => new EventSource(url));
    this.eventSource = factory(`${this.baseUrl}/events`);
    return this.eventSource;
  }

  private async get<T>(path: string): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`);
    return parseJsonResponse<T>(response);
  }

  private async put<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    return parseJsonResponse<T>(response);
  }
}

export function createHttpApiClient(options: HttpApiOptions): RendererApi {
  return new HttpApiClient(options);
}

function getWindowApi(): RendererApi | null {
  if (typeof window === 'undefined') {
    return null;
  }

  if (window.codexDevtools) {
    return window.codexDevtools;
  }

  if (window.api) {
    return window.api;
  }

  return null;
}

const isElectrobunRuntime = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  return (
    typeof window.__electrobunWebviewId === 'number' &&
    typeof window.__electrobunRpcSocketPort === 'number'
  );
};

let cachedHttpApi: RendererApi | null = null;
let cachedElectrobunApiPromise: Promise<RendererApi | null> | null = null;
let cachedResolvedApiPromise: Promise<RendererApi> | null = null;

const createElectrobunApiClient = async (): Promise<RendererApi | null> => {
  if (!isElectrobunRuntime()) {
    return null;
  }

  try {
    const { Electroview } = await import('electrobun/view');
    const rpc = Electroview.defineRPC<CodexDevtoolsRpc>({
      handlers: {},
    }) as ElectroviewRpc;
    new Electroview({ rpc: rpc as never });

    return {
      getProjects: () => rpc.request.getProjects({}),
      getSessions: (projectCwd: string) => rpc.request.getSessions({ projectCwd }),
      getSessionDetail: (sessionId: string) => rpc.request.getSessionDetail({ sessionId }),
      getSessionChunks: (sessionId: string) => rpc.request.getSessionChunks({ sessionId }),
      getStats: (scope?: CodexStatsScope) => rpc.request.getStats({ scope }),
      searchSessions: (query: string) => rpc.request.searchSessions({ query }),
      getConfig: () => rpc.request.getConfig({}),
      updateConfig: (key, value) => rpc.request.updateConfig({ key, value }),
      getAppVersion: () => rpc.request.getAppVersion({}),
      checkAppUpdate: () => rpc.request.checkAppUpdate({}),
      onFileChange: (callback) => {
        const listener = (payload: unknown): void => {
          callback(payload as CodexFileChangeEvent);
        };

        rpc.addMessageListener('fileChange', listener);
        return (): void => {
          rpc.removeMessageListener('fileChange', listener);
        };
      },
    };
  } catch {
    return null;
  }
};

const resolveApi = async (): Promise<RendererApi> => {
  const windowApi = getWindowApi();
  if (windowApi) {
    return windowApi;
  }

  if (cachedResolvedApiPromise) {
    return cachedResolvedApiPromise;
  }

  cachedResolvedApiPromise = (async () => {
    if (!cachedElectrobunApiPromise) {
      cachedElectrobunApiPromise = createElectrobunApiClient();
    }

    const electrobunApi = await cachedElectrobunApiPromise;
    if (electrobunApi) {
      return electrobunApi;
    }

    if (!cachedHttpApi) {
      cachedHttpApi = createHttpApiClient({
        baseUrl: getHttpBaseUrl(),
      });
    }

    return cachedHttpApi;
  })();

  return cachedResolvedApiPromise;
};

const invoke = async <T>(call: (impl: RendererApi) => Promise<T>): Promise<T> => {
  const impl = await resolveApi();
  return call(impl);
};

export const isElectronMode = (): boolean => getWindowApi() !== null || isElectrobunRuntime();

export const api: RendererApi = {
  getProjects: () => invoke((impl) => impl.getProjects()),
  getSessions: (projectCwd: string) => invoke((impl) => impl.getSessions(projectCwd)),
  getSessionDetail: (sessionId: string) => invoke((impl) => impl.getSessionDetail(sessionId)),
  getSessionChunks: (sessionId: string) => invoke((impl) => impl.getSessionChunks(sessionId)),
  getStats: (scope?: CodexStatsScope) => invoke((impl) => impl.getStats(scope)),
  searchSessions: (query: string) => invoke((impl) => impl.searchSessions(query)),
  getConfig: () => invoke((impl) => impl.getConfig()),
  updateConfig: (key: keyof CodexDevToolsConfig, value: unknown) =>
    invoke((impl) => impl.updateConfig(key, value)),
  getAppVersion: () => invoke((impl) => impl.getAppVersion()),
  checkAppUpdate: () => invoke((impl) => impl.checkAppUpdate()),
  onFileChange: (callback: (event: CodexFileChangeEvent) => void) => {
    let removeListener: (() => void) | null = null;
    let cancelled = false;

    void resolveApi().then((impl) => {
      if (cancelled) {
        return;
      }

      removeListener = impl.onFileChange(callback);
    });

    return (): void => {
      cancelled = true;
      if (removeListener) {
        removeListener();
      }
    };
  },
};

declare global {
  interface Window {
    codexDevtools?: RendererApi;
    api?: RendererApi;
    __electrobunWebviewId?: number;
    __electrobunRpcSocketPort?: number;
  }
}
