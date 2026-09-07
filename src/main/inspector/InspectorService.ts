import { promises as fs } from 'node:fs';
import type { InspectorApi, InspectorRateCard, InspectorSession, StatsQuery, TraceQuery, TraceResult } from '../../shared/inspector';
import { analyzeSession } from './analysis';
import { readRollout } from './readRollout';
import { aggregateInspectorStats, compactAnalysis, type CompactAnalysis } from './statistics';
import { inspectInstallation } from './installation';

/** Structural adapter: both Electrobun and the web server use the SAME implementation. */
export interface InspectorContext {
  scanner: { scanSessions(): Promise<InspectorSession[]> };
  getModelRates(): Promise<InspectorRateCard>;
  onFileChange(listener: () => void): () => void;
}
export class InspectorService implements InspectorApi {
  private catalog: { at: number; sessions: InspectorSession[] } | null = null;
  private loading: Promise<InspectorSession[]> | null = null;
  private statsCache = new Map<string, { revision: string; data: CompactAnalysis }>();
  private removeListener: () => void;
  constructor(private readonly context: InspectorContext) {
    this.removeListener = context.onFileChange(() => { this.catalog = null; });
  }
  dispose(): void { this.removeListener(); this.statsCache.clear(); this.catalog = null; }
  async getInspectorSessions(): Promise<InspectorSession[]> {
    if (this.catalog && Date.now() - this.catalog.at < 10_000) return this.catalog.sessions;
    if (this.loading) return this.loading;
    this.loading = this.context.scanner.scanSessions().then(sessions => {
      this.catalog = { at: Date.now(), sessions }; return sessions;
    }).finally(() => { this.loading = null; });
    return this.loading;
  }
  async getInspectorTrace(query: TraceQuery): Promise<TraceResult> {
    const session = (await this.getInspectorSessions()).find(s => s.id === query.sessionId);
    if (!session) throw new Error('Session not found. Refresh the session list.');
    const raw = await readRollout(session.filePath);
    const analysis = analyzeSession(raw.entries, session, raw.warnings);
    const search = (query.search || '').toLowerCase().slice(0, 500);
    const filtered = analysis.rows.filter(row => (!query.kind || row.kind === query.kind) && (!search || `${row.name}\n${row.detail}`.toLowerCase().includes(search)));
    const offset = Number.isFinite(query.offset) ? Math.max(0, Math.floor(query.offset!)) : 0;
    const limit = Number.isFinite(query.limit) ? Math.max(1, Math.min(200, Math.floor(query.limit!))) : 100;
    const counts = { message: 0, tool: 0, command: 0, reasoning: 0, event: 0 };
    for (const row of analysis.rows) counts[row.kind]++;
    // The strip is an event-position overview, NOT fabricated contiguous duration spans.
    const stride = Math.max(1, Math.ceil(analysis.rows.length / 240));
    return { session: analysis.session, rows: filtered.slice(offset, offset + limit), total: filtered.length, counts,
      offset, limit, totals: analysis.totals, durationMs: analysis.durationMs, warnings: analysis.warnings,
      timeline: analysis.rows.filter((_, index) => index % stride === 0).map(row => ({ timestamp: row.timestamp, kind: row.kind })) };
  }
  async getInspectorStats(query: StatsQuery) {
    const sessions = (await this.getInspectorSessions()).filter(s => !query.cwd || s.cwd === query.cwd);
    const records: CompactAnalysis[] = new Array(sessions.length);
    let next = 0;
    // Three bounded workers, not an unbounded Promise.all over thousands of rollout files.
    const worker = async (): Promise<void> => {
      while (next < sessions.length) {
        const index = next++, session = sessions[index];
        try {
          const stat = await fs.stat(session.filePath), revision = `${stat.size}:${stat.mtimeMs}`;
          const cached = this.statsCache.get(session.filePath);
          if (cached?.revision === revision) { records[index] = cached.data; continue; }
          const raw = await readRollout(session.filePath);
          const data = compactAnalysis(analyzeSession(raw.entries, session, raw.warnings));
          records[index] = data;
          this.statsCache.delete(session.filePath); this.statsCache.set(session.filePath, { revision, data });
          if (this.statsCache.size > 128) this.statsCache.delete(this.statsCache.keys().next().value!);
        } catch {
          records[index] = { session, samples: [], activity: [], warnings: ['An unreadable or removed rollout was excluded. Usage totals may be incomplete.'] };
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, sessions.length) }, worker));
    return aggregateInspectorStats(records, query, await this.context.getModelRates());
  }
  async getInspectorInstallation(query: { cwd?: string } = {}) {
    if (query.cwd && !(await this.getInspectorSessions()).some(s => s.cwd === query.cwd)) throw new Error('Select a discovered project before inspecting its configuration.');
    return inspectInstallation({ cwd: query.cwd });
  }
}
const instances = new WeakMap<object, InspectorService>();
export function inspectorFor(context: InspectorContext | null): InspectorService {
  if (!context) throw new Error('Codex services are not ready.');
  let service = instances.get(context);
  if (!service) { service = new InspectorService(context); instances.set(context, service); }
  return service;
}
