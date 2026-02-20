import type { CodexDevToolsConfig, CodexFileChangeEvent } from '@main/services/infrastructure';
import type { CodexParsedSession } from '@main/services/parsing';
import type {
  CodexChunk,
  CodexProject,
  CodexSearchSessionsResult,
  CodexSession,
  CodexStatsScope,
  CodexStatsSummary,
} from '@main/types';

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
      return this.get<CodexStatsSummary>(
        `/stats?scope=project&cwd=${encodeURIComponent(scope.cwd)}`,
      );
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

let cachedHttpApi: RendererApi | null = null;

function resolveApi(): RendererApi {
  const windowApi = getWindowApi();
  if (windowApi) {
    return windowApi;
  }

  if (!cachedHttpApi) {
    cachedHttpApi = createHttpApiClient({
      baseUrl: getHttpBaseUrl(),
    });
  }

  return cachedHttpApi;
}

export const isElectronMode = (): boolean => getWindowApi() !== null;

export const api: RendererApi = new Proxy({} as RendererApi, {
  get(_target, prop, receiver): unknown {
    const impl = resolveApi();
    const value = Reflect.get(impl as object, prop, receiver);

    if (typeof value === 'function') {
      return (value as (...args: unknown[]) => unknown).bind(impl);
    }

    return value;
  },
});

declare global {
  interface Window {
    codexDevtools?: RendererApi;
    api?: RendererApi;
  }
}
