import { createLogger } from '@shared/utils/logger';

import type { CodexServiceContext } from '@main/services/infrastructure';
import type { FastifyInstance } from 'fastify';

const logger = createLogger('HTTP:search');

export const registerSearchRoutes = (app: FastifyInstance, services: CodexServiceContext): void => {
  app.get<{ Querystring: { q?: string } }>('/search', async (request) => {
    const query = request.query.q ?? '';

    try {
      return await services.searchSessions(query);
    } catch (error) {
      logger.error('Error in GET /search', error);
      return {
        query,
        totalMatches: 0,
        sessionsSearched: 0,
        results: [],
      };
    }
  });
};
