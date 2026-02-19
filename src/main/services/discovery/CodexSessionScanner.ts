import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  type CodexProject,
  type CodexSession,
  type CodexSessionModelUsage,
  isSessionMetaEntry,
  isTurnContextEntry,
} from '@main/types';
import { readFirstJsonlEntry } from '@main/utils/jsonl';
import { createLogger } from '@shared/utils/logger';

const logger = createLogger('Service:CodexSessionScanner');

export interface CodexSessionScanOptions {
  startDate?: Date;
  endDate?: Date;
}

function isWithinDateRange(timestamp: string, options: CodexSessionScanOptions): boolean {
  const current = new Date(timestamp).getTime();
  if (Number.isNaN(current)) {
    return false;
  }

  if (options.startDate && current < options.startDate.getTime()) {
    return false;
  }

  if (options.endDate && current > options.endDate.getTime()) {
    return false;
  }

  return true;
}

function fallbackSessionIdFromName(fileName: string): string {
  const match = fileName.match(/-([a-zA-Z0-9-]+)\.jsonl$/);
  return match?.[1] ?? fileName.replace(/\.jsonl$/, '');
}

function normalizeModel(model: string | undefined): string {
  return model?.trim() ?? '';
}

function normalizeReasoningEffort(effort: string | undefined): string {
  const value = effort?.trim();
  return value ? value : 'unknown';
}

async function getFileSizeBytes(filePath: string): Promise<number | undefined> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile() ? stats.size : undefined;
  } catch {
    return undefined;
  }
}

export class CodexSessionScanner {
  private readonly sessionsRoot: string;

  constructor(sessionsRoot: string = path.join(os.homedir(), '.codex', 'sessions')) {
    this.sessionsRoot = sessionsRoot;
  }

  async scanSessions(options: CodexSessionScanOptions = {}): Promise<CodexSession[]> {
    const sessionFiles = await this.findRolloutFiles(this.sessionsRoot);
    const sessions: CodexSession[] = [];

    for (const filePath of sessionFiles) {
      const metaEntry = await readFirstJsonlEntry(filePath, (value) =>
        isSessionMetaEntry(value) ? value : null,
      );

      if (!metaEntry) {
        logger.warn(`Skipping session file without valid session_meta: ${filePath}`);
        continue;
      }

      if (!isWithinDateRange(metaEntry.timestamp, options)) {
        continue;
      }

      const [firstTurnUsage, fileSizeBytes] = await Promise.all([
        readFirstJsonlEntry<CodexSessionModelUsage>(filePath, (value) => {
          if (!isTurnContextEntry(value)) {
            return null;
          }

          const model = normalizeModel(value.payload.model);
          if (!model) {
            return null;
          }

          return {
            model,
            reasoningEffort: normalizeReasoningEffort(value.payload.effort),
          };
        }),
        getFileSizeBytes(filePath),
      ]);

      const sessionMetaModel = normalizeModel(metaEntry.payload.model);
      const firstTurnModel = firstTurnUsage?.model ?? '';
      const modelUsages =
        firstTurnUsage
          ? [firstTurnUsage]
          : sessionMetaModel
            ? [{ model: sessionMetaModel, reasoningEffort: 'unknown' }]
            : [];

      const fileName = path.basename(filePath);
      sessions.push({
        id: metaEntry.payload.id ?? fallbackSessionIdFromName(fileName),
        filePath,
        fileSizeBytes,
        cwd: metaEntry.payload.cwd ?? '',
        model: firstTurnModel || sessionMetaModel,
        modelUsages,
        cliVersion: metaEntry.payload.cli_version ?? '',
        gitBranch: metaEntry.payload.git?.branch ?? '',
        gitCommit: metaEntry.payload.git?.commit_hash ?? '',
        startTime: metaEntry.timestamp,
        modelProvider: metaEntry.payload.model_provider ?? '',
      });
    }

    sessions.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    return sessions;
  }

  async scanProjects(options: CodexSessionScanOptions = {}): Promise<CodexProject[]> {
    const sessions = await this.scanSessions(options);
    const projectMap = new Map<string, CodexProject>();

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

  private async findRolloutFiles(root: string): Promise<string[]> {
    try {
      const rootStat = await fs.stat(root);
      if (!rootStat.isDirectory()) {
        return [];
      }
    } catch {
      return [];
    }

    const files: string[] = [];
    const pending: string[] = [root];

    while (pending.length > 0) {
      const current = pending.pop();
      if (!current) {
        continue;
      }

      const entries = await fs.readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          pending.push(fullPath);
          continue;
        }

        if (entry.isFile() && /^rollout-.*\.jsonl$/.test(entry.name)) {
          files.push(fullPath);
        }
      }
    }

    return files;
  }
}
