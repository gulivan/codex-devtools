import { createLogger } from '@shared/utils/logger';

import { registerConfigRoutes } from './config';
import { registerEventRoutes } from './events';
import { registerProjectRoutes } from './projects';
import { registerSearchRoutes } from './search';
import { registerSessionRoutes } from './sessions';
import { registerUtilityRoutes } from './utility';

import type { CodexServiceContext } from '@main/services/infrastructure';
import type { FastifyInstance } from 'fastify';

const logger = createLogger('HTTP:routes');

export interface HttpRouteServices {
  serviceContext: CodexServiceContext;
  getVersion?: () => string;
}

export const registerHttpRoutes = (app: FastifyInstance, services: HttpRouteServices): void => {
  registerProjectRoutes(app, services.serviceContext);
  registerSessionRoutes(app, services.serviceContext);
  registerSearchRoutes(app, services.serviceContext);
  registerConfigRoutes(app, services.serviceContext);
  registerUtilityRoutes(app, services.getVersion);
  registerEventRoutes(app);

  logger.info('All HTTP routes registered');
};
