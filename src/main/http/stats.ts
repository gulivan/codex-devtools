import { createLogger } from '@shared/utils/logger';

import type { CodexServiceContext } from '@main/services/infrastructure';
import type { CodexStatsScope } from '@main/types';
import type { FastifyInstance } from 'fastify';

const logger = createLogger('HTTP:stats');

function decodeMaybeUri(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseStatsScope(scope: string | undefined, cwd: string | undefined): CodexStatsScope {
  if (scope === 'project' && cwd && cwd.trim().length > 0) {
    return {
      type: 'project',
      cwd: decodeMaybeUri(cwd),
    };
  }

  return { type: 'all' };
}

export const registerStatsRoutes = (app: FastifyInstance, services: CodexServiceContext): void => {
  app.get<{ Querystring: { scope?: string; cwd?: string } }>('/stats', async (request) => {
    try {
      const scope = parseStatsScope(request.query.scope, request.query.cwd);
      return await services.getStats(scope);
    } catch (error) {
      logger.error('Error in GET /stats', error);
      return {
        generatedAt: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local',
        scope: { type: 'all' },
        totals: {
          sessions: 0,
          archivedSessions: 0,
          eventCount: 0,
          durationMs: 0,
          estimatedCostUsd: 0,
          totalTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          reasoningTokens: 0,
        },
        daily: [],
        hourly: [],
        topDays: [],
        topHours: [],
        models: [],
        reasoningEfforts: [],
        costCoverage: {
          pricedTokens: 0,
          unpricedTokens: 0,
          unpricedModels: [],
        },
        rates: {
          updatedAt: null,
          source: null,
        },
      };
    }
  });
};
