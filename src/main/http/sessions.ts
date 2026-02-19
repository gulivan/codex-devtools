import { createLogger } from '@shared/utils/logger';

import type { CodexServiceContext } from '@main/services/infrastructure';
import type { FastifyInstance } from 'fastify';

const logger = createLogger('HTTP:sessions');

export const registerSessionRoutes = (app: FastifyInstance, services: CodexServiceContext): void => {
  app.get<{ Params: { id: string } }>('/sessions/:id', async (request) => {
    try {
      return await services.getSessionDetail(request.params.id);
    } catch (error) {
      logger.error(`Error in GET /sessions/${request.params.id}`, error);
      return null;
    }
  });

  app.get<{ Params: { id: string } }>('/sessions/:id/chunks', async (request) => {
    try {
      return await services.getSessionChunks(request.params.id);
    } catch (error) {
      logger.error(`Error in GET /sessions/${request.params.id}/chunks`, error);
      return null;
    }
  });
};
