import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { InspectorApi, StatsQuery, TraceQuery } from '../../shared/inspector';
import { record } from './analysis';

export interface LegacyWebContext {
  getProjects(): Promise<unknown>;
  getSessions(cwd: string): Promise<unknown>;
  getSessionDetail(id: string): Promise<unknown>;
  getSessionChunks(id: string): Promise<unknown>;
  getStats(scope: { type: 'all' } | { type: 'project'; cwd: string }): Promise<unknown>;
  getModelRates(): Promise<unknown>;
  refreshModelRates(): Promise<unknown>;
  searchSessions(query: string): Promise<unknown>;
  getConfig(): unknown;
  updateConfig(key: never, value: unknown): unknown;
  onFileChange(callback: (event: unknown) => void): () => void;
}
export interface NativeWebOptions {
  inspector: InspectorApi;
  context: LegacyWebContext;
  rendererRoot: string;
  port: number;
  version: string;
  checkUpdate: () => Promise<unknown>;
}
const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json' };
export function isLocalRequest(request: Request, port: number): boolean {
  const url = new URL(request.url), origin = request.headers.get('origin');
  const allowedHost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!allowedHost || Number(url.port || (url.protocol === 'https:' ? 443 : 80)) !== port) return false;
  if (origin && origin !== url.origin) return false;
  const site = request.headers.get('sec-fetch-site');
  return !site || site === 'same-origin' || site === 'none';
}
function commonHeaders(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" };
}
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...commonHeaders(), 'Content-Type': 'application/json; charset=utf-8' } });
}
function queryObject(url: URL): Record<string, unknown> {
  const encoded = url.searchParams.get('query') || '{}';
  if (encoded.length > 8192) throw new Error('Query is too large.');
  const value: unknown = JSON.parse(encoded);
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new Error('Expected an object query.');
  return record(value);
}
function validateStats(q: Record<string, unknown>): StatsQuery {
  for (const key of ['cwd', 'model', 'from', 'to', 'timezone', 'bucket']) if (q[key] !== undefined && typeof q[key] !== 'string') throw new Error(`Invalid ${key}.`);
  if (q.groupByModel !== undefined && typeof q.groupByModel !== 'boolean') throw new Error('Invalid model grouping.');
  return q as StatsQuery;
}
function validateTrace(q: Record<string, unknown>): TraceQuery {
  if (typeof q.sessionId !== 'string' || !q.sessionId || q.sessionId.length > 256) throw new Error('A session ID is required.');
  if (q.kind && !['message', 'tool', 'command', 'reasoning', 'event'].includes(String(q.kind))) throw new Error('Unknown trace category.');
  if (q.search !== undefined && typeof q.search !== 'string') throw new Error('Invalid trace search.');
  for (const key of ['offset', 'limit']) if (q[key] !== undefined && (typeof q[key] !== 'number' || !Number.isFinite(q[key]))) throw new Error(`Invalid ${key}.`);
  return q as unknown as TraceQuery;
}
function eventsResponse(request: Request, context: LegacyWebContext): Response {
  const encoder = new TextEncoder();
  let cleanup = (): void => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (value: string): void => { if (!closed) try { controller.enqueue(encoder.encode(value)); } catch { cleanup(); } };
      const remove = context.onFileChange(event => send(`event: file-change\ndata: ${JSON.stringify(event)}\n\n`));
      const heartbeat = setInterval(() => send(': keepalive\n\n'), 15000);
      cleanup = (): void => {
        if (closed) return; closed = true;
        clearInterval(heartbeat); remove(); request.signal.removeEventListener('abort', cleanup);
        try { controller.close(); } catch { /* Already cancelled. */ }
      };
      request.signal.addEventListener('abort', cleanup, { once: true });
      if (request.signal.aborted) cleanup(); else send(': connected\n\n');
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, { headers: { ...commonHeaders(), 'Content-Type': 'text/event-stream', Connection: 'keep-alive' } });
}

/** Native Fetch handler; independently testable under Node 20+, served by Bun without packages. */
export function createNativeWebHandler(options: NativeWebOptions): (request: Request) => Promise<Response> {
  const { context, inspector } = options;
  return async (request): Promise<Response> => {
    if (!isLocalRequest(request, options.port)) return json({ error: 'Only same-origin loopback requests are accepted.' }, 403);
    const url = new URL(request.url);
    try {
      if (request.method === 'PUT' && url.pathname === '/config') {
        if (!request.headers.get('content-type')?.includes('application/json')) return json({ error: 'Expected JSON.' }, 415);
        const body = await request.text();
        if (Buffer.byteLength(body) > 65536) return json({ error: 'Request too large.' }, 413);
        const value = record(JSON.parse(body));
        return json(context.updateConfig(String(value.key) as never, value.value));
      }
      if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405);
      switch (url.pathname) {
        case '/inspector/sessions': return json(await inspector.getInspectorSessions());
        case '/inspector/trace': return json(await inspector.getInspectorTrace(validateTrace(queryObject(url))));
        case '/inspector/stats': return json(await inspector.getInspectorStats(validateStats(queryObject(url))));
        case '/inspector/installation': {
          const q = queryObject(url);
          if (q.cwd !== undefined && typeof q.cwd !== 'string') throw new Error('Invalid project.');
          return json(await inspector.getInspectorInstallation({ cwd: q.cwd as string | undefined }));
        }
        case '/projects': return json(await context.getProjects());
        case '/stats': return json(await context.getStats(url.searchParams.get('scope') === 'project' ? { type: 'project', cwd: url.searchParams.get('cwd') || '' } : { type: 'all' }));
        case '/stats/rates': return json(await context.getModelRates());
        case '/search': return json(await context.searchSessions((url.searchParams.get('q') || '').slice(0, 1000)));
        case '/config': return json(context.getConfig());
        case '/version': return new Response(options.version, { headers: commonHeaders() });
        case '/app-update': return json(await options.checkUpdate());
        case '/events': return eventsResponse(request, context);
      }
      const project = url.pathname.match(/^\/projects\/([^/]+)\/sessions$/);
      if (project) return json(await context.getSessions(decodeURIComponent(project[1])));
      const session = url.pathname.match(/^\/sessions\/([^/]+)(\/chunks)?$/);
      if (session) return json(session[2] ? await context.getSessionChunks(decodeURIComponent(session[1])) : await context.getSessionDetail(decodeURIComponent(session[1])));
      if (url.pathname.startsWith('/inspector/')) return json({ error: 'Unknown inspector endpoint.' }, 404);
      const decoded = decodeURIComponent(url.pathname);
      if (decoded.includes('\0') || decoded.includes('\\')) return json({ error: 'Invalid asset path.' }, 400);
      const root = await fs.realpath(options.rendererRoot);
      const file = await fs.realpath(path.join(root, decoded === '/' ? 'index.html' : decoded));
      const relative = path.relative(root, file);
      if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) return json({ error: 'Invalid asset path.' }, 403);
      if (!(await fs.stat(file)).isFile()) return json({ error: 'Not found.' }, 404);
      return new Response(request.method === 'HEAD' ? null : await fs.readFile(file), { headers: { ...commonHeaders(), 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' } });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return json({ error: 'Not found.' }, 404);
      // Do not expose raw filesystem/TOML diagnostics or stack traces over HTTP.
      const message = error instanceof Error ? error.message : 'Request failed.';
      const safe = /^(Choose |The date |Hourly charts |Unsupported time |Too many chart |Select a |Session not found|A session ID|Unknown trace|Invalid |Expected an object|Query is too)/.test(message);
      return json({ error: safe ? message : 'Unable to inspect this resource. Check the local server log and file permissions.' }, 400);
    }
  };
}
