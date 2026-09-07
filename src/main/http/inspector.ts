import { createLogger } from '@shared/utils/logger';

import { inspectorFor } from '@main/inspector/InspectorService';
import type { StatsQuery, TraceKind, TraceQuery } from '@shared/inspector';
import type { CodexServiceContext } from '@main/services/infrastructure';
import type { FastifyInstance, FastifyReply } from 'fastify';

const logger = createLogger('HTTP:inspector');

const TRACE_KINDS: TraceKind[] = ['message', 'tool', 'command', 'reasoning', 'event'];
const BUCKETS = ['hour', 'day', 'week'];

/** Keep the same contract as the native server: only surface safe, user-actionable messages. */
function safeInspectorError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Request failed.';
  const safe =
    /^(Choose |The date |Hourly charts |Unsupported time |Too many chart |Select a |Session not found|A session ID|Unknown trace|Invalid |Expected an object|Query is too|An unreadable|The session path)/.test(
      message,
    );
  return safe ? message : 'Unable to inspect this resource. Check the server log and file permissions.';
}

function fail(reply: FastifyReply, error: unknown): unknown {
  logger.warn('Inspector request failed', error);
  return reply.status(400).send({ error: safeInspectorError(error) });
}

function parseTraceQuery(query: Record<string, unknown>): TraceQuery {
  const sessionId = typeof query.sessionId === 'string' ? query.sessionId : '';
  if (!sessionId || sessionId.length > 256) {
    throw new Error('A session ID is required.');
  }

  let kind: TraceKind | undefined;
  if (query.kind !== undefined && query.kind !== '') {
    if (!TRACE_KINDS.includes(String(query.kind) as TraceKind)) {
      throw new Error('Unknown trace category.');
    }
    kind = String(query.kind) as TraceKind;
  }

  if (query.search !== undefined && typeof query.search !== 'string') {
    throw new Error('Invalid trace search.');
  }

  const parsed: TraceQuery = { sessionId, kind, search: query.search };
  for (const key of ['offset', 'limit'] as const) {
    if (query[key] === undefined || query[key] === '') continue;
    const value = Number(query[key]);
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid ${key}.`);
    }
    parsed[key] = value;
  }

  return parsed;
}

function parseStatsQuery(query: Record<string, unknown>): StatsQuery {
  const strings: Partial<Record<'cwd' | 'model' | 'from' | 'to' | 'timezone' | 'bucket', string>> = {};
  for (const key of ['cwd', 'model', 'from', 'to', 'timezone', 'bucket'] as const) {
    if (query[key] === undefined || query[key] === '') continue;
    if (typeof query[key] !== 'string') {
      throw new Error(`Invalid ${key}.`);
    }
    strings[key] = String(query[key]);
  }

  if (strings.bucket !== undefined && !BUCKETS.includes(strings.bucket)) {
    throw new Error('Unsupported time bucket.');
  }

  const parsed: StatsQuery = { ...strings, bucket: strings.bucket as StatsQuery['bucket'] };

  if (query.groupByModel !== undefined && query.groupByModel !== '') {
    if (query.groupByModel === 'true' || query.groupByModel === '1') {
      parsed.groupByModel = true;
    } else if (query.groupByModel === 'false' || query.groupByModel === '0') {
      parsed.groupByModel = false;
    } else {
      throw new Error('Invalid model grouping.');
    }
  }

  return parsed;
}

export const registerInspectorRoutes = (app: FastifyInstance, services: CodexServiceContext): void => {
  const inspector = inspectorFor(services);

  app.get('/inspector/sessions', async (_request, reply) => {
    try {
      return await inspector.getInspectorSessions();
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get<{ Querystring: Record<string, string> }>('/inspector/trace', async (request, reply) => {
    try {
      return await inspector.getInspectorTrace(parseTraceQuery(request.query));
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get<{ Querystring: Record<string, string> }>('/inspector/stats', async (request, reply) => {
    try {
      return await inspector.getInspectorStats(parseStatsQuery(request.query));
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get<{ Querystring: { cwd?: string } }>('/inspector/installation', async (request, reply) => {
    try {
      const cwd = request.query.cwd?.trim();
      return await inspector.getInspectorInstallation({ cwd: cwd || undefined });
    } catch (error) {
      return fail(reply, error);
    }
  });
};
