import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import type { ConfigSource, InstallationResult, InstalledSkill } from '../../shared/inspector';
import { record } from './analysis';

export const codexHome = (): string => path.resolve(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'));
const scalar = (v: unknown): string | number | boolean | null =>
  typeof v === 'string' ? v.slice(0, 300) : typeof v === 'boolean' || typeof v === 'number' ? v : null;
const safeName = (v: unknown, fallback = ''): string => typeof v === 'string' ? v.slice(0, 160) : fallback;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SETTINGS = ['model', 'model_provider', 'model_reasoning_effort', 'model_reasoning_summary', 'approval_policy', 'sandbox_mode', 'web_search', 'service_tier', 'personality', 'profile', 'model_context_window', 'model_auto_compact_token_limit'];
export function safeSettings(config: Record<string, unknown>): ConfigSource['settings'] {
  const result: ConfigSource['settings'] = {};
  for (const key of SETTINGS) { const value = scalar(config[key]); if (value !== null) result[key] = value; }
  for (const [key, value] of Object.entries(record(config.features))) if (typeof value === 'boolean') result[`features.${key}`] = value;
  return result;
}
/** Endpoint display deliberately omits userinfo, path, query and fragment. */
export function safeOrigin(value: unknown): string {
  if (typeof value !== 'string') return 'Not specified';
  try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.origin : 'Non-HTTP endpoint'; }
  catch { return 'Invalid endpoint'; }
}
export type TomlParser = (input: string) => unknown;
function nativeToml(input: string): unknown {
  const runtime = (globalThis as unknown as { Bun?: { TOML?: { parse: TomlParser } } }).Bun;
  if (!runtime?.TOML) throw new Error('Bun.TOML.parse is unavailable.');
  return runtime.TOML.parse(input);
}
async function boundedRead(file: string, maxBytes: number): Promise<string> {
  const handle = await fs.open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes) throw new Error('File inspection limit exceeded.');
    const buffer = Buffer.alloc(maxBytes + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > maxBytes) throw new Error('File inspection limit exceeded.');
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally { await handle.close(); }
}
function detectedVersion(): Promise<string | null> {
  return new Promise(resolve => {
    execFile('codex', ['--version'], { timeout: 2000, maxBuffer: 4096, windowsHide: true, shell: false }, (error, stdout) => {
      resolve(error ? null : stdout.trim().split(/\r?\n/)[0].slice(0, 120));
    });
  });
}
export interface InstallationOptions {
  home?: string;
  userHome?: string;
  cwd?: string;
  parseToml?: TomlParser;
  version?: () => Promise<string | null>;
  systemSkills?: string;
}
export async function inspectInstallation(options: InstallationOptions = {}): Promise<InstallationResult> {
  const home = path.resolve(options.home || codexHome()), userHome = options.userHome || os.homedir();
  const result: InstallationResult = { home, cliVersion: null, configSources: [], skills: [], mcp: [], providers: [], warnings: [
    'File configuration, not the complete live effective config. CLI flags, managed policy, trust decisions and running MCP connections are not probed.',
  ] };
  const parse = options.parseToml || nativeToml;
  const sources: { path: string; scope: 'user' | 'project' }[] = [{ path: path.join(home, 'config.toml'), scope: 'user' }];
  if (options.cwd) sources.push({ path: path.join(options.cwd, '.codex', 'config.toml'), scope: 'project' });
  const disabled = new Set<string>(), enabled = new Set<string>();
  for (const source of sources) {
    const view: ConfigSource = { ...source, status: 'missing', settings: {}, profiles: [] };
    result.configSources.push(view);
    try {
      const config = record(parse(await boundedRead(source.path, 1024 * 1024)));
      view.status = 'read'; view.settings = safeSettings(config);
      view.profiles = Object.entries(record(config.profiles)).map(([name, value]) => ({ name, settings: safeSettings(record(value)) }));
      for (const [name, data] of Object.entries(record(config.mcp_servers))) {
        const mcp = record(data), command = safeName(mcp.command);
        const executable = path.basename(command.replace(/\\/g, '/'));
        result.mcp.push({
          name, source: source.path, enabled: mcp.enabled !== false,
          transport: mcp.url ? 'HTTP' : 'stdio', endpoint: mcp.url ? safeOrigin(mcp.url) : /^[\w.+-]+$/.test(executable) ? executable : 'Configured command',
          argumentCount: Array.isArray(mcp.args) ? mcp.args.length : 0,
          environmentNames: [...new Set([...Object.keys(record(mcp.env)), ...(Array.isArray(mcp.env_vars) ? mcp.env_vars.filter((v): v is string => typeof v === 'string') : [])])].filter(v => ENV_NAME.test(v)),
        });
      }
      for (const [id, data] of Object.entries(record(config.model_providers))) {
        const provider = record(data), envKey = safeName(provider.env_key);
        result.providers.push({ id, name: safeName(provider.name, id), source: source.path, endpoint: safeOrigin(provider.base_url), wireApi: safeName(provider.wire_api, 'Default'), credentialVariable: ENV_NAME.test(envKey) ? envKey : null });
      }
      const skillConfig = record(config.skills).config;
      if (source.scope === 'user' && Array.isArray(skillConfig)) for (const value of skillConfig) {
        const item = record(value);
        if (typeof item.path !== 'string' || typeof item.enabled !== 'boolean') continue;
        const file = path.resolve(home, item.path);
        (item.enabled ? enabled : disabled).add(file);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        view.status = 'error';
        // TOML parser diagnostics can include secret-bearing source lines. Never serialize them.
        result.warnings.push(`Unable to parse or read ${source.scope} configuration. Check permissions, TOML syntax and the 1 MiB size limit.`);
      }
    }
  }
  const roots = [
    { path: path.join(userHome, '.agents', 'skills'), scope: 'User' },
    { path: path.join(home, 'skills'), scope: 'Codex home' },
    { path: options.systemSkills || '/etc/codex/skills', scope: 'System' },
  ];
  if (options.cwd) {
    // Project-level discovery is bounded at the repository root; nothing is executed.
    let directory = path.resolve(options.cwd);
    for (let depth = 0; depth < 32; depth++) {
      roots.unshift({ path: path.join(directory, '.agents', 'skills'), scope: 'Project' });
      try { await fs.lstat(path.join(directory, '.git')); break; } catch { /* Ascend to the repo root. */ }
      const parent = path.dirname(directory); if (parent === directory) break; directory = parent;
    }
  }
  const canonicalRoots = new Set<string>();
  for (const root of roots) { try { canonicalRoots.add(await fs.realpath(root.path)); } catch { /* Missing optional root. */ } }
  const inside = (file: string): boolean => [...canonicalRoots].some(root => { const relative = path.relative(root, file); return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)); });
  const visited = new Set<string>();
  const pending = roots.map(root => ({ ...root, depth: 0 }));
  while (pending.length && visited.size < 1024) {
    const next = pending.shift()!;
    try {
      const real = await fs.realpath(next.path);
      if (visited.has(real) || !inside(real)) continue;
      visited.add(real);
      const files = await fs.readdir(real, { withFileTypes: true });
      if (files.some(f => f.name === 'SKILL.md' && f.isFile())) {
        const skillPath = path.join(real, 'SKILL.md');
        const markdown = await boundedRead(skillPath, 256 * 1024);
        const frontmatter = markdown.startsWith('---') ? markdown.split(/^---\s*$/m)[1] || '' : '';
        const declared = frontmatter.match(/^name:\s*["']?([^\r\n"']+)/m)?.[1].trim();
        const skill: InstalledSkill = { name: declared || path.basename(real), path: skillPath, scope: next.scope,
          enabled: disabled.has(skillPath) || disabled.has(real) ? false : enabled.has(skillPath) || enabled.has(real) ? true : null };
        result.skills.push(skill);
        continue; // A skill's scripts/assets are not additional skills.
      }
      if (next.depth < 6) for (const file of files) {
        if ((file.isDirectory() || file.isSymbolicLink()) && !['node_modules', '.git', '.cache'].includes(file.name)) pending.push({ path: path.join(real, file.name), scope: next.scope, depth: next.depth + 1 });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') result.warnings.push('A skill directory was unreadable or exceeded the inspection limit.');
    }
  }
  if (pending.length) result.warnings.push('Skill discovery reached its directory limit. Some skills may be absent.');
  result.skills.sort((a, b) => a.name.localeCompare(b.name));
  result.cliVersion = await (options.version || detectedVersion)();
  if (!result.cliVersion) result.warnings.push('Codex was not found on this process’s PATH, or its version command did not finish within two seconds.');
  return result;
}
