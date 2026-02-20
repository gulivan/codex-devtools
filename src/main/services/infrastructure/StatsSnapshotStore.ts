import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import type {
  CodexStatsSessionDailyBucket,
  CodexStatsSessionHourlyBucket,
  CodexStatsSessionModelTokenTotals,
  CodexStatsSessionRecord,
} from '@main/services/analysis';
import { createLogger } from '@shared/utils/logger';

const logger = createLogger('Service:StatsSnapshotStore');
const SNAPSHOT_VERSION = 1;

interface StatsSnapshotFile {
  version: number;
  updatedAt: string;
  sessions: CodexStatsSessionRecord[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isTokenTotals(value: unknown): boolean {
  return (
    isRecord(value)
    && isFiniteNumber(value.totalTokens)
    && isFiniteNumber(value.inputTokens)
    && isFiniteNumber(value.outputTokens)
    && isFiniteNumber(value.cachedTokens)
    && isFiniteNumber(value.reasoningTokens)
  );
}

function isDailyBucket(value: unknown): value is CodexStatsSessionDailyBucket {
  return isRecord(value) && isString(value.date) && isFiniteNumber(value.eventCount) && isTokenTotals(value);
}

function isHourlyBucket(value: unknown): value is CodexStatsSessionHourlyBucket {
  return isRecord(value) && isFiniteNumber(value.hour) && isFiniteNumber(value.eventCount) && isTokenTotals(value);
}

function isModelTotals(value: unknown): value is CodexStatsSessionModelTokenTotals {
  return (
    isRecord(value)
    && isString(value.model)
    && isString(value.reasoningEffort)
    && isTokenTotals(value)
  );
}

function isSessionModelUsage(value: unknown): boolean {
  return isRecord(value) && isString(value.model) && isString(value.reasoningEffort);
}

function isSessionRecord(value: unknown): value is CodexStatsSessionRecord {
  return (
    isRecord(value)
    && (!('tokenComputationVersion' in value) || isFiniteNumber(value.tokenComputationVersion))
    && isString(value.sessionId)
    && isString(value.filePath)
    && isString(value.revision)
    && typeof value.archived === 'boolean'
    && isString(value.cwd)
    && isString(value.startTime)
    && isString(value.lastActivity)
    && isFiniteNumber(value.eventCount)
    && isFiniteNumber(value.turnCount)
    && isFiniteNumber(value.toolCallCount)
    && isFiniteNumber(value.durationMs)
    && Array.isArray(value.modelUsages)
    && value.modelUsages.every(isSessionModelUsage)
    && isTokenTotals(value.tokens)
    && Array.isArray(value.modelTokenTotals)
    && value.modelTokenTotals.every(isModelTotals)
    && Array.isArray(value.dailyBuckets)
    && value.dailyBuckets.every(isDailyBucket)
    && Array.isArray(value.hourlyBuckets)
    && value.hourlyBuckets.every(isHourlyBucket)
    && isString(value.lastSeenAt)
  );
}

function isSnapshotFile(value: unknown): value is StatsSnapshotFile {
  return (
    isRecord(value)
    && isFiniteNumber(value.version)
    && Array.isArray(value.sessions)
    && value.sessions.every(isSessionRecord)
  );
}

function cloneSessions(rows: CodexStatsSessionRecord[]): CodexStatsSessionRecord[] {
  return structuredClone(rows);
}

export class StatsSnapshotStore {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async getSessions(): Promise<CodexStatsSessionRecord[]> {
    const snapshot = await this.readSnapshot();
    return cloneSessions(snapshot.sessions);
  }

  async saveSessions(rows: CodexStatsSessionRecord[]): Promise<void> {
    const snapshot: StatsSnapshotFile = {
      version: SNAPSHOT_VERSION,
      updatedAt: new Date().toISOString(),
      sessions: cloneSessions(rows),
    };

    const directory = path.dirname(this.filePath);
    await fs.mkdir(directory, { recursive: true });

    const tempPath = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tempPath, JSON.stringify(snapshot, null, 2), 'utf8');
    await fs.rename(tempPath, this.filePath);
  }

  private async readSnapshot(): Promise<StatsSnapshotFile> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (!isSnapshotFile(parsed) || parsed.version !== SNAPSHOT_VERSION) {
        return {
          version: SNAPSHOT_VERSION,
          updatedAt: new Date(0).toISOString(),
          sessions: [],
        };
      }

      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn('Failed to read stats snapshot, using empty snapshot', error);
      }

      return {
        version: SNAPSHOT_VERSION,
        updatedAt: new Date(0).toISOString(),
        sessions: [],
      };
    }
  }
}
