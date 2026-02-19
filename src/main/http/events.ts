import { createLogger } from '@shared/utils/logger';

import type { FastifyInstance, FastifyReply } from 'fastify';

const logger = createLogger('HTTP:events');
const KEEPALIVE_INTERVAL_MS = 30_000;
const sseClients = new Set<FastifyReply>();

export const registerEventRoutes = (app: FastifyInstance): void => {
  app.get('/events', async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    sseClients.add(reply);
    logger.info(`SSE client connected (total: ${sseClients.size})`);

    const timer = setInterval(() => {
      reply.raw.write(':ping\n\n');
    }, KEEPALIVE_INTERVAL_MS);

    request.raw.on('close', () => {
      clearInterval(timer);
      sseClients.delete(reply);
      logger.info(`SSE client disconnected (total: ${sseClients.size})`);
    });

    await reply;
  });
};

export const broadcastEvent = (channel: string, data: unknown): void => {
  const payload = `event: ${channel}\ndata: ${JSON.stringify(data)}\n\n`;

  for (const client of sseClients) {
    try {
      client.raw.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
};

export const broadcastFileChangeEvent = (event: unknown): void => {
  broadcastEvent('file-change', event);
};
