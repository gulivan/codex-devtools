import { readFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { CodexServiceContext } from '../services/infrastructure/CodexServiceContext';
import { checkForAppUpdate } from '../services/infrastructure/AppUpdateChecker';
import { InspectorService } from './InspectorService';
import { codexHome } from './installation';
import { createNativeWebHandler } from './nativeServer';

type BunRuntime = { serve(options: { hostname: string; port: number; maxRequestBodySize: number; idleTimeout: number; fetch: (request: Request) => Promise<Response> }): { stop(): void } };
const runtime = (globalThis as unknown as { Bun?: BunRuntime }).Bun;
if (!runtime) throw new Error('Run the lightweight server with Bun 1.2 or newer.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const rendererRoot = path.join(root, 'dist');
if (!existsSync(path.join(rendererRoot, 'index.html'))) throw new Error('Built renderer missing. From a source checkout, run pnpm build:renderer first.');
const port = Number(process.env.PORT || '3456');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
const hostname = process.env.HOST || '127.0.0.1';
if (!['127.0.0.1', 'localhost', '::1'].includes(hostname)) throw new Error('The inspector is local-only. Use an SSH tunnel for remote access instead of binding it to the network.');
const version = String(JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version);
const context = new CodexServiceContext({ sessionsPath: process.env.CODEX_SESSIONS_PATH || path.join(codexHome(), 'sessions') });
const inspector = new InspectorService(context);
context.start();
const server = runtime.serve({ hostname, port, maxRequestBodySize: 65536, idleTimeout: 0,
  fetch: createNativeWebHandler({ context, inspector, rendererRoot, port, version,
    checkUpdate: () => checkForAppUpdate({ currentVersion: version }),
  }),
});
const url = `http://${hostname === '::1' ? '[::1]' : hostname}:${port}`;
console.log(`codex-devtools ${version}\nLocal inspector: ${url}\nRead-only Codex installation inspection. Press Ctrl+C to stop.`);
if (process.env.CODEX_DEVTOOLS_OPEN === '1') {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer.exe' : 'xdg-open';
  execFile(command, [url], { timeout: 3000 }, () => {});
}
let stopped = false;
const stop = (): void => { if (stopped) return; stopped = true; inspector.dispose(); context.dispose(); server.stop(); };
process.once('SIGINT', stop); process.once('SIGTERM', stop);
