import { createLogger } from '@shared/utils/logger';

import type { CodexDevToolsConfig, CodexServiceContext } from '@main/services/infrastructure';
import type { FastifyInstance } from 'fastify';

const logger = createLogger('HTTP:config');

interface UpdateConfigBody {
  key: keyof CodexDevToolsConfig;
  value: unknown;
}

export const registerConfigRoutes = (app: FastifyInstance, services: CodexServiceContext): void => {
  app.get('/config', async () => {
    return services.getConfig();
  });

  app.put<{ Body: UpdateConfigBody }>('/config', async (request) => {
    try {
      return services.updateConfig(request.body.key, request.body.value);
    } catch (error) {
      logger.error('Error in PUT /config', error);
      return null;
    }
  });
};
