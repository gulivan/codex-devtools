import type { InspectorRateCard, SessionAnalysis, StatsQuery, StatsResult, TimePoint, UsageSample } from '../../shared/inspector';
import { addTokens, estimatePrice, zeroTokens } from './analysis';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const zeroPoint = (key: string): TimePoint => ({ key, input: 0, cached: 0, output: 0, price: 0, knownPrice: 0, unpricedTokens: 0 });
export type CompactAnalysis = Pick<SessionAnalysis, 'session' | 'samples' | 'warnings'> & {
  activity: { timestamp: string; model: string }[];
};
export function compactAnalysis(analysis: SessionAnalysis): CompactAnalysis {
  return { session: analysis.session, samples: analysis.samples, warnings: analysis.warnings,
    activity: analysis.rows.map(row => ({ timestamp: row.timestamp, model: row.model })) };
}

export function aggregateInspectorStats(records: CompactAnalysis[], query: StatsQuery, rates: InspectorRateCard, now = new Date()): StatsResult {
  const timezone = query.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  let formatter: Intl.DateTimeFormat;
  try { formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }); }
  catch { throw new Error('Choose a valid IANA timezone, such as UTC or Europe/Berlin.'); }
  const bucket = query.bucket || 'day';
  if (!['hour', 'day', 'week'].includes(bucket)) throw new Error('Unsupported time bucket.');
  const parts = (timestamp: string): Record<string, string> => Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map(p => [p.type, p.value]));
  const keyFor = (timestamp: string): string => {
    if (bucket === 'hour') return new Date(Math.floor(Date.parse(timestamp) / HOUR) * HOUR).toISOString();
    const p = parts(timestamp), dateKey = `${p.year}-${p.month}-${p.day}`;
    if (bucket === 'day') return dateKey;
    const date = new Date(`${dateKey}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    return date.toISOString().slice(0, 10);
  };
  const scoped = records.filter(r => !query.cwd || r.session.cwd === query.cwd);
  const allDates = scoped.flatMap(r => [...r.samples.map(s => Date.parse(s.timestamp)), ...r.activity.map(a => Date.parse(a.timestamp))]);
  const from = query.from ? Date.parse(query.from) : allDates.reduce((min, d) => Math.min(min, d), now.getTime());
  const to = query.to ? Date.parse(query.to) : now.getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) throw new Error('The date range is invalid.');
  if (bucket === 'hour' && (to - from) / HOUR > 2048) throw new Error('Hourly charts support at most 85 days. Choose daily or weekly buckets.');
  if ((to - from) / DAY > 365 * 30) throw new Error('The date range is too large.');
  const inRange = (ts: string): boolean => { const n = Date.parse(ts); return n >= from && n <= to; };
  const models = [...new Set(scoped.flatMap(r => r.samples.filter(s => inRange(s.timestamp)).map(s => s.model)))].sort();
  const includeModel = (model: string): boolean => !query.model || query.model === model;
  const totals = { ...zeroTokens(), knownPrice: 0, unpricedTokens: 0, sessions: 0, events: 0 };
  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, events: 0, tokens: 0 }));
  const series = new Map<string, Map<string, TimePoint>>();
  const breakdown = new Map<string, { tokens: number; input: number; cached: number; price: number | null }>();
  const lookup = new Map(rates.models.map(r => [r.model.trim().toLowerCase(), r]));
  const warnings = new Set<string>();
  const seenResponses = new Set<string>();
  const sessions = new Set<string>();
  for (const r of scoped) {
    for (const warning of r.warnings) warnings.add(warning);
    for (const a of r.activity) {
      if (!inRange(a.timestamp) || !includeModel(a.model)) continue;
      hourly[Number(parts(a.timestamp).hour) % 24].events++;
      totals.events++;
      sessions.add(r.session.id);
    }
    for (const sample of r.samples) {
      if (!inRange(sample.timestamp) || !includeModel(sample.model)) continue;
      // Copied/resumed response records can appear in multiple physical rollout files.
      if (sample.responseId && seenResponses.has(sample.responseId)) continue;
      if (sample.responseId) seenResponses.add(sample.responseId);
      sessions.add(r.session.id);
      addTokens(totals, sample);
      hourly[Number(parts(sample.timestamp).hour) % 24].tokens += sample.input + sample.output;
      const price = estimatePrice(sample, lookup.get(sample.model.trim().toLowerCase()));
      const total = sample.input + sample.output;
      if (price === null) totals.unpricedTokens += total; else totals.knownPrice += price;
      const modelTotals = breakdown.get(sample.model) || { tokens: 0, input: 0, cached: 0, price: 0 };
      modelTotals.tokens += total; modelTotals.input += sample.input; modelTotals.cached += sample.cached;
      modelTotals.price = price === null || modelTotals.price === null ? null : modelTotals.price + price;
      breakdown.set(sample.model, modelTotals);
      const group = query.groupByModel ? sample.model : query.model || 'All models';
      const points = series.get(group) || new Map<string, TimePoint>();
      const key = keyFor(sample.timestamp), point = points.get(key) || zeroPoint(key);
      addSample(point, sample, price);
      points.set(key, point); series.set(group, points);
    }
  }
  const keys: string[] = [];
  // Daily keys are calendar dates in the selected zone, not server-local timestamps.
  const first = keyFor(new Date(from).toISOString()), last = keyFor(new Date(to).toISOString());
  const step = bucket === 'hour' ? HOUR : bucket === 'week' ? 7 * DAY : DAY;
  for (let t = Date.parse(bucket === 'hour' ? first : `${first}T00:00:00Z`); ; t += step) {
    const key = bucket === 'hour' ? new Date(t).toISOString() : new Date(t).toISOString().slice(0, 10);
    if (key > last) break;
    if (keys.length >= 12_000) throw new Error('Too many chart buckets. Narrow the date range.');
    keys.push(key);
  }
  if (!series.size) series.set(query.model || 'All models', new Map());
  totals.sessions = sessions.size;
  if (totals.unpricedTokens) warnings.add('Price gaps indicate missing model or cache-write rates. Totals show only the known API-equivalent estimate, not an actual bill.');
  return {
    generatedAt: now.toISOString(), timezone, models,
    series: [...series].map(([model, values]) => ({ model, points: keys.map(key => values.get(key) || zeroPoint(key)) })),
    hourly, totals,
    modelBreakdown: [...breakdown].map(([model, m]) => ({ model, tokens: m.tokens, price: m.price, cachedPercent: m.input ? 100 * m.cached / m.input : 0 })).sort((a, b) => b.tokens - a.tokens),
    warnings: [...warnings], ratesUpdatedAt: rates.updatedAt || null, ratesSource: rates.source || null,
    activityScope: query.model ? 'selected-model' : 'all-models',
  };
}
function addSample(point: TimePoint, s: UsageSample, price: number | null): void {
  point.cached += s.cached; point.input += Math.max(s.input - s.cached, 0); point.output += s.output;
  if (price === null) { point.price = null; point.unpricedTokens += s.input + s.output; }
  else { point.knownPrice += price; if (point.price !== null) point.price += price; }
}
