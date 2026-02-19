import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import { CodexChunkBuilder } from '@main/services/analysis';
import { CodexSessionScanner } from '@main/services/discovery';
import { CodexSessionParser, type CodexParsedSession } from '@main/services/parsing';
import {
  type CodexChunk,
  type CodexLogEntry,
  type CodexSearchSessionsResult,
  type CodexSession,
  getContentBlockText,
  isAgentMessagePayload,
  isAgentReasoningPayload,
  isEventMsgEntry,
  isFunctionCallOutputPayload,
  isFunctionCallPayload,
  isMessagePayload,
  isReasoningPayload,
  isResponseItemEntry,
  isUserMessagePayload,
  reasoningSummaryToText,
} from '@main/types';

import { ConfigManager, type CodexDevToolsConfig } from './ConfigManager';
import { DataCache } from './DataCache';
import { FileWatcher, type CodexFileChangeEvent } from './FileWatcher';

export interface CodexServiceContextOptions {
  sessionsPath?: string;
  configPath?: string;
  cacheSize?: number;
  cacheTtlMinutes?: number;
}

const DETAIL_CACHE_PREFIX = 'detail';
const CHUNKS_CACHE_PREFIX = 'chunks';
const SESSIONS_CACHE_PREFIX = 'sessions';
const UNKNOWN_REVISION = 'unknown-revision';

function extractSearchContent(entry: CodexLogEntry): string {
  if (isResponseItemEntry(entry) && isMessagePayload(entry.payload)) {
    return entry.payload.content.map(getContentBlockText).filter(Boolean).join('\n').trim();
  }

  if (isResponseItemEntry(entry) && isFunctionCallPayload(entry.payload)) {
    return `${entry.payload.name}\n${entry.payload.arguments}`.trim();
  }

  if (isResponseItemEntry(entry) && isFunctionCallOutputPayload(entry.payload)) {
    return entry.payload.output.trim();
  }

  if (isResponseItemEntry(entry) && isReasoningPayload(entry.payload)) {
    return reasoningSummaryToText(entry.payload.summary).join('\n').trim();
  }

  if (isEventMsgEntry(entry) && isUserMessagePayload(entry.payload)) {
    return entry.payload.message.trim();
  }

  if (isEventMsgEntry(entry) && isAgentMessagePayload(entry.payload)) {
    return entry.payload.message.trim();
  }

  if (isEventMsgEntry(entry) && isAgentReasoningPayload(entry.payload)) {
    return entry.payload.text.trim();
  }

  return '';
}

function buildSnippet(content: string, query: string): string {
  const normalizedContent = content.replace(/\s+/g, ' ').trim();
  const lowercaseContent = normalizedContent.toLowerCase();
  const index = lowercaseContent.indexOf(query);

  if (index < 0) {
    return normalizedContent.slice(0, 180);
  }

  const start = Math.max(0, index - 60);
  const end = Math.min(normalizedContent.length, index + query.length + 120);
  return normalizedContent.slice(start, end);
}

function buildProjectsFromSessions(sessions: CodexSession[]) {
  const projectMap = new Map<
    string,
    {
      cwd: string;
      name: string;
      sessionCount: number;
      lastActivity: string;
    }
  >();

  for (const session of sessions) {
    const existing = projectMap.get(session.cwd);
    if (!existing) {
      projectMap.set(session.cwd, {
        cwd: session.cwd,
        name: path.basename(session.cwd) || session.cwd,
        sessionCount: 1,
        lastActivity: session.startTime,
      });
      continue;
    }

    existing.sessionCount += 1;
    if (new Date(session.startTime).getTime() > new Date(existing.lastActivity).getTime()) {
      existing.lastActivity = session.startTime;
    }
  }

  return Array.from(projectMap.values()).sort(
    (a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime(),
  );
}

export class CodexServiceContext {
  readonly scanner: CodexSessionScanner;
  readonly parser: CodexSessionParser;
  readonly chunkBuilder: CodexChunkBuilder;
  readonly dataCache: DataCache<unknown>;
  readonly watcher: FileWatcher;
  readonly configManager: ConfigManager;

  private readonly removeFileChangeListener: () => void;

  constructor(options: CodexServiceContextOptions = {}) {
    const sessionsPath = options.sessionsPath ?? process.env.CODEX_SESSIONS_PATH;
    this.scanner = new CodexSessionScanner(sessionsPath);
    this.parser = new CodexSessionParser();
    this.chunkBuilder = new CodexChunkBuilder();
    this.dataCache = new DataCache<unknown>(options.cacheSize ?? 200, options.cacheTtlMinutes ?? 10);
    this.watcher = new FileWatcher(sessionsPath);
    this.configManager = new ConfigManager(options.configPath);

    this.removeFileChangeListener = this.watcher.onFileChange(() => {
      this.dataCache.clear();
    });
  }

  start(): void {
    this.watcher.start();
  }

  stop(): void {
    this.watcher.stop();
  }

  dispose(): void {
    this.removeFileChangeListener();
    this.watcher.dispose();
    this.dataCache.clear();
  }

  onFileChange(listener: (event: CodexFileChangeEvent) => void): () => void {
    return this.watcher.onFileChange(listener);
  }

  async getProjects() {
    const sessions = await this.getAllSessions();
    return buildProjectsFromSessions(sessions);
  }

  async getSessions(projectCwd: string): Promise<CodexSession[]> {
    if (!projectCwd) {
      return [];
    }

    const sessions = await this.getAllSessions();
    return sessions.filter((session) => session.cwd === projectCwd);
  }

  async getSessionDetail(sessionId: string): Promise<CodexParsedSession | null> {
    if (!sessionId) {
      return null;
    }

    const session = await this.findSessionById(sessionId);
    if (!session) {
      return null;
    }

    const revision = await this.getSessionFileRevision(session.filePath);
    const cacheKey = DataCache.buildKey(DETAIL_CACHE_PREFIX, `${sessionId}:${revision}`);
    const cached = this.dataCache.get(cacheKey) as CodexParsedSession | undefined;
    if (cached) {
      return cached;
    }

    const parsed = await this.parser.parseSessionFile(session.filePath);
    this.dataCache.set(cacheKey, parsed);
    return parsed;
  }

  async getSessionChunks(sessionId: string): Promise<CodexChunk[] | null> {
    if (!sessionId) {
      return null;
    }

    const session = await this.findSessionById(sessionId);
    if (!session) {
      return null;
    }

    const revision = await this.getSessionFileRevision(session.filePath);
    const cacheKey = DataCache.buildKey(CHUNKS_CACHE_PREFIX, `${sessionId}:${revision}`);
    const cached = this.dataCache.get(cacheKey) as CodexChunk[] | undefined;
    if (cached) {
      return cached;
    }

    const detail = await this.getSessionDetail(sessionId);
    if (!detail) {
      return null;
    }

    const chunks = this.chunkBuilder.buildChunks(detail.entries);
    this.dataCache.set(cacheKey, chunks);
    return chunks;
  }

  async searchSessions(query: string): Promise<CodexSearchSessionsResult> {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return {
        query,
        totalMatches: 0,
        sessionsSearched: 0,
        results: [],
      };
    }

    const sessions = await this.getAllSessions();
    const results: CodexSearchSessionsResult['results'] = [];

    for (const session of sessions) {
      const detail = await this.getSessionDetail(session.id);
      if (!detail) {
        continue;
      }

      for (const classified of detail.classifiedEntries) {
        const content = extractSearchContent(classified.entry);
        if (!content || !content.toLowerCase().includes(normalizedQuery)) {
          continue;
        }

        results.push({
          sessionId: detail.session.id,
          cwd: detail.session.cwd,
          timestamp: classified.entry.timestamp,
          kind: classified.kind,
          content,
          snippet: buildSnippet(content, normalizedQuery),
        });
      }
    }

    return {
      query,
      totalMatches: results.length,
      sessionsSearched: sessions.length,
      results,
    };
  }

  getConfig(): CodexDevToolsConfig {
    return this.configManager.getConfig();
  }

  updateConfig(key: keyof CodexDevToolsConfig, value: unknown): CodexDevToolsConfig | null {
    const current = this.configManager.getConfig();
    if (!(key in current)) {
      return null;
    }

    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }

    return this.configManager.updateSection(
      key,
      value as Partial<CodexDevToolsConfig[typeof key]>,
    );
  }

  private async findSessionById(sessionId: string): Promise<CodexSession | null> {
    const sessions = await this.getAllSessions();
    const match = sessions.find((session) => session.id === sessionId);
    return match ?? null;
  }

  private async getAllSessions(): Promise<CodexSession[]> {
    const cacheKey = DataCache.buildKey(SESSIONS_CACHE_PREFIX, 'all');
    const cached = this.dataCache.get(cacheKey) as CodexSession[] | undefined;
    if (cached) {
      return cached;
    }

    const sessions = await this.scanner.scanSessions();
    this.dataCache.set(cacheKey, sessions);
    return sessions;
  }

  private async getSessionFileRevision(filePath: string): Promise<string> {
    try {
      const stats = await fs.stat(filePath);
      return `${Math.floor(stats.mtimeMs)}:${stats.size}`;
    } catch {
      return UNKNOWN_REVISION;
    }
  }
}
