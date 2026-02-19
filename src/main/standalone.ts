import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { registerHttpRoutes } from './http';
import { broadcastFileChangeEvent } from './http/events';
import { readVersionFromPackageJson } from './http/utility';
import { CodexServiceContext } from './services/infrastructure';

import { createLogger } from '@shared/utils/logger';

import type { FastifyInstance } from 'fastify';

const logger = createLogger('Standalone');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface StandaloneServer {
  app: FastifyInstance;
  serviceContext: CodexServiceContext;
}

export interface StandaloneServerOptions {
  sessionsPath?: string;
  configPath?: string;
}

export const createStandaloneServer = async (
  options: StandaloneServerOptions = {},
): Promise<StandaloneServer> => {
  const enableHttpLogs = process.env.CODEX_DEVTOOLS_HTTP_LOGS === '1';
  const app = Fastify({ logger: enableHttpLogs });
  const serviceContext = new CodexServiceContext({
    sessionsPath: options.sessionsPath ?? process.env.CODEX_SESSIONS_PATH,
    configPath: options.configPath,
  });

  serviceContext.start();
  const removeFileChangeListener = serviceContext.onFileChange((event) => {
    broadcastFileChangeEvent(event);
  });

  app.addHook('onClose', async () => {
    removeFileChangeListener();
    serviceContext.dispose();
  });

  await app.register(fastifyCors, { origin: true });
  await app.register(fastifyStatic, {
    root: join(__dirname, '../../out/renderer'),
    prefix: '/',
  });

  registerHttpRoutes(app, {
    serviceContext,
    getVersion: readVersionFromPackageJson,
  });

  return { app, serviceContext };
};

const startStandalone = async (): Promise<void> => {
  const { app } = await createStandaloneServer();
  const host = process.env.HOST ?? '0.0.0.0';
  const port = Number(process.env.PORT ?? '3456');

  await app.listen({ host, port });
  logger.info(`Standalone server listening on http://${host}:${port}`);
};

export const startStandaloneCli = (start: () => Promise<void> = startStandalone): void => {
  void start().catch((error) => {
    logger.error('Standalone startup failed', error);
    process.exitCode = 1;
  });
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startStandaloneCli();
}
