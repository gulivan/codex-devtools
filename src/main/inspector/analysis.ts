import type {
  InspectorSession, ModelRate, RolloutEnvelope, SessionAnalysis, TokenTotals,
  TraceKind, TraceRow, UsageSample,
} from '../../shared/inspector';

export const record = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const text = (v: unknown): string => typeof v === 'string' ? v : '';
const positive = (v: unknown): number => typeof v === 'number' && Number.isFinite(v) ? Math.max(v, 0) : 0;
export const zeroTokens = (): TokenTotals => ({ input: 0, cached: 0, output: 0, reasoning: 0, cacheWrite: 0 });
export function addTokens(target: TokenTotals, source: TokenTotals): void {
  target.input += source.input; target.cached += source.cached; target.output += source.output;
  target.reasoning += source.reasoning; target.cacheWrite += source.cacheWrite;
}
export function usageTokens(v: unknown): TokenTotals | null {
  const u = record(v);
  if (typeof u.input_tokens !== 'number' || typeof u.output_tokens !== 'number') return null;
  if (![u.input_tokens, u.output_tokens].every(Number.isFinite)) return null;
  const input = positive(u.input_tokens), output = positive(u.output_tokens);
  return {
    input, output, cached: Math.min(input, positive(u.cached_input_tokens)),
    reasoning: Math.min(output, positive(u.reasoning_output_tokens)), cacheWrite: positive(u.cache_write_input_tokens),
  };
}
/** API-equivalent estimate at the supplied rate card, NOT a subscription invoice. */
export function estimatePrice(tokens: TokenTotals, rate?: ModelRate): number | null {
  if (tokens.input + tokens.output === 0) return 0;
  if (!rate || tokens.cacheWrite > 0) return null; // Separate cache-write rates are not in the legacy card.
  const values = [rate.inputUsdPer1M, rate.cachedInputUsdPer1M, rate.outputUsdPer1M, rate.reasoningOutputUsdPer1M];
  if (values.some(v => !Number.isFinite(v) || v < 0)) return null;
  return ((Math.max(tokens.input - tokens.cached, 0) * rate.inputUsdPer1M)
    + tokens.cached * rate.cachedInputUsdPer1M
    + Math.max(tokens.output - tokens.reasoning, 0) * rate.outputUsdPer1M
    + tokens.reasoning * rate.reasoningOutputUsdPer1M) / 1_000_000;
}

export function parseEnvelope(v: unknown): RolloutEnvelope | null {
  const o = record(v);
  if (!text(o.type) || !text(o.timestamp) || !Number.isFinite(Date.parse(text(o.timestamp)))) return null;
  if (o.payload === null || typeof o.payload !== 'object' || Array.isArray(o.payload)) return null;
  // Deliberately validate only the envelope. New variants must not disappear.
  return { type: text(o.type), timestamp: text(o.timestamp), payload: record(o.payload) };
}
const snake = (s: string): string => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[\s/-]+/g, '_').toLowerCase();
function contentText(v: unknown): string {
  if (typeof v === 'string') return v;
  if (!Array.isArray(v)) return '';
  return v.map(b => typeof b === 'string' ? b : text(record(b).text)).filter(Boolean).join('\n');
}
function describe(p: Record<string, unknown>): string {
  const selected = contentText(p.content) || text(p.message) || text(p.text) || contentText(p.summary)
    || text(p.input) || text(p.arguments) || text(p.output) || text(p.aggregated_output)
    || contentText(record(p.action).command) || text(p.query) || text(p.diff);
  if (selected) return selected.slice(0, 24_000);
  // Avoid accidentally dumping encrypted reasoning or multi-megabyte inline images.
  return JSON.stringify(p, (key, value: unknown) => {
    if (/encrypted_content|image_url|audio|authorization|api[_-]?key|access_token|refresh_token|password|secret/i.test(key)) return '[redacted]';
    if (typeof value === 'string' && value.length > 3000) return `${value.slice(0, 3000)}…`;
    return value;
  }, 2).slice(0, 24_000);
}
function kindFor(type: string, p: Record<string, unknown>): TraceKind {
  if (/reasoning/.test(type)) return 'reasoning';
  if (/message/.test(type) && !/delta/.test(type)) return 'message';
  const name = `${type} ${text(p.name)}`;
  if (/exec_command|shell|terminal|command_execution/.test(name)) return 'command';
  if (/function_call|custom_tool|tool_search|web_search|image_generation|mcp_tool|patch_apply|file_change|tool_call/.test(name)) return 'tool';
  return 'event';
}
function titleFor(type: string, p: Record<string, unknown>): string {
  if (type === 'message') return p.role === 'developer' || p.role === 'system' ? 'System prelude' : p.role === 'user' ? 'User message' : 'Assistant message';
  if (type === 'agent_message') return 'Assistant message';
  if (type === 'function_call' || type === 'custom_tool_call') return text(p.name) || type.replace(/_/g, ' ');
  return type.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}
const keys: (keyof TokenTotals)[] = ['input', 'cached', 'output', 'reasoning', 'cacheWrite'];
/** Cumulative snapshots can repeat or reset after compaction. Never add totals as new usage. */
export function counterDelta(previous: TokenTotals | null, current: TokenTotals, last: TokenTotals | null): TokenTotals | null {
  if (!previous) return last;
  if (keys.every(k => previous[k] === current[k])) return null;
  if (keys.some(k => current[k] < previous[k])) return last;
  const delta = zeroTokens();
  for (const k of keys) delta[k] = current[k] - previous[k];
  delta.cached = Math.min(delta.input, delta.cached);
  delta.reasoning = Math.min(delta.output, delta.reasoning);
  return delta;
}

export function analyzeSession(entries: RolloutEnvelope[], session: InspectorSession, readWarnings: string[] = []): SessionAnalysis {
  let model = session.model || 'unknown', turnId = 'unscoped';
  let previous: TokenTotals | null = null;
  const counters: UsageSample[] = [], responses: UsageSample[] = [], rows: TraceRow[] = [];
  const seenResponses = new Set<string>(), responseTurns = new Set<string>();
  const warnings = new Set(readWarnings), pending = new Map<string, TraceRow>();
  const mirrorMessages = new Set<string>();
  const hasTurnMarkers = entries.some(e => e.type === 'turn_context' || /^(task|turn)_started$/.test(text(e.payload.type)));
  // Use lossless response items rather than their duplicate legacy message summaries.
  for (const e of entries) {
    const p = record(e.payload.item).type ? record(e.payload.item) : e.payload;
    if (e.type === 'response_item' && p.type === 'message') mirrorMessages.add(`${p.role}:${contentText(p.content).trim()}`);
  }
  let title = session.title || '';
  for (let index = 0; index < entries.length; index++) {
    const e = entries[index], original = e.payload;
    let p = original;
    let type = e.type === 'event_msg' || e.type === 'response_item' ? snake(text(p.type) || e.type) : e.type;
    if (e.type === 'response_item' && record(p.item).type) { p = record(p.item); type = snake(text(p.type)); }
    if (type === 'session_meta') continue;
    if (/^(task|turn)_started$/.test(type)) turnId = text(p.turn_id) || text(p.id) || `turn:${index}`;
    if (type === 'turn_context') {
      model = text(p.model) || model;
      turnId = text(p.turn_id) || turnId;
      continue;
    }
    if (type === 'thread_settings_applied') {
      if (!p.thread_id || p.thread_id === session.id) model = text(record(p.thread_settings).model) || model;
    }
    if (type === 'model_reroute') model = text(p.to_model) || model;
    if (type === 'token_usage_record' || type === 'raw_response_completed') {
      const u = usageTokens(p.usage || p.token_usage), responseId = text(p.response_id);
      if (p.thread_id && p.thread_id !== session.id) continue; // Inherited parent history is not child-local usage.
      if (u && responseId && !seenResponses.has(responseId)) {
        const ownerTurn = text(p.turn_id) || turnId;
        responses.push({ ...u, timestamp: e.timestamp, model, turnId: ownerTurn, responseId, source: 'response' });
        seenResponses.add(responseId); responseTurns.add(ownerTurn);
      }
      continue;
    }
    if (type === 'token_count') {
      const info = record(p.info), current = usageTokens(info.total_token_usage), last = usageTokens(info.last_token_usage);
      if (current) {
        const delta = counterDelta(previous, current, last);
        previous = current;
        if (delta && delta.input + delta.output > 0) counters.push({ ...delta, timestamp: e.timestamp, model, turnId, source: 'counter' });
      }
      // Rate-limit-only updates are real events but must not look like token generation.
      if (!p.info && p.rate_limits) {
        rows.push({ id: `row:${index}`, timestamp: e.timestamp, kind: 'event', name: 'Rate limits updated', eventType: type, model,
          detail: describe(record(p.rate_limits)), durationMs: null, tokens: null, status: 'recorded' });
      }
      continue;
    }
    if (type === 'item_completed' || type === 'item_started') {
      p = record(original.item);
      type = snake(text(p.type) || 'unknown_item');
    }
    const mirrorRole = type === 'user_message' ? 'user' : type === 'agent_message' ? 'assistant' : '';
    if (e.type === 'event_msg' && mirrorRole && mirrorMessages.has(`${mirrorRole}:${text(p.message).trim()}`)) continue;
    // Paginated FunctionCallOutput items carry their own ID and structured output.
    const callId = text(p.call_id) || text(p.callId) || text(p.id) || text(original.call_id);
    const isOutput = /(?:function_call_output|custom_tool_call_output|tool_search_output)$/.test(type);
    const isEnd = /_end$/.test(type);
    if ((isOutput || isEnd || original.type === 'item_completed') && callId && pending.has(callId)) {
      const row = pending.get(callId)!;
      row.durationMs = Math.max(0, Date.parse(e.timestamp) - Date.parse(row.timestamp));
      row.status = p.success === false || Number(p.exit_code) > 0 || p.status === 'failed' ? 'failed' : 'completed';
      row.detail = `${row.detail}\n\n── Result ──\n${describe(p)}`.slice(0, 48_000);
      pending.delete(callId);
      continue;
    }
    const detail = describe(p), kind = kindFor(type, p);
    if (!title && ((type === 'message' && p.role === 'user') || type === 'user_message')) title = (contentText(p.content) || text(p.message)).replace(/\s+/g, ' ').slice(0, 120);
    const start = positive(original.started_at_ms), end = positive(original.completed_at_ms);
    const row: TraceRow = {
      id: `row:${index}`, timestamp: e.timestamp, kind, name: titleFor(type, p), eventType: type, model,
      detail, callId: callId || undefined, durationMs: start && end >= start ? end - start : null,
      tokens: null, status: p.success === false || p.status === 'failed' ? 'failed' : original.type === 'item_completed' || isEnd || isOutput ? 'completed' : 'recorded',
    };
    if (callId && (/(_begin|_call)$/.test(type) || original.type === 'item_started')) {
      pending.set(callId, row); row.status = 'running';
    }
    rows.push(row);
  }
  let filteredCounters = counters.filter(s => !responseTurns.has(s.turnId));
  if (!hasTurnMarkers && responses.length) {
    filteredCounters = [];
    if (counters.length) warnings.add('This capture has per-response usage but no turn markers. Counter snapshots are omitted to avoid double counting; older counter-only usage may be absent.');
  }
  const samples = [...filteredCounters, ...responses].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const totals = zeroTokens();
  for (const sample of samples) addTokens(totals, sample);
  if (totals.cacheWrite > 0) warnings.add('Cache-write usage is recorded, but the current rate card has no cache-write price. Affected price points are unavailable.');
  const times = entries.map(e => Date.parse(e.timestamp));
  const first = times[0] || Date.parse(session.startTime), last = times[times.length - 1] || first;
  return { session: { ...session, title: title || `Session ${session.id.slice(0, 8)}` }, rows, samples,
    totals, durationMs: Math.max(last - first, 0), warnings: [...warnings] };
}
