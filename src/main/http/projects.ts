import { createLogger } from '@shared/utils/logger';

import type { CodexServiceContext } from '@main/services/infrastructure';
import type { FastifyInstance } from 'fastify';

const logger = createLogger('HTTP:projects');

function decodeCwd(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export const registerProjectRoutes = (app: FastifyInstance, services: CodexServiceContext): void => {
  app.get('/projects', async () => {
    try {
      return await services.getProjects();
    } catch (error) {
      logger.error('Error in GET /projects', error);
      return [];
    }
  });

  app.get<{ Params: { cwd: string } }>('/projects/:cwd/sessions', async (request) => {
    const cwd = decodeCwd(request.params.cwd);

    try {
      return await services.getSessions(cwd);
    } catch (error) {
      logger.error(`Error in GET /projects/${cwd}/sessions`, error);
      return [];
    }
  });
};
