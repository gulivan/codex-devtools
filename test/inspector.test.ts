import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { analyzeSession, counterDelta, parseEnvelope, usageTokens, zeroTokens } from '@main/inspector/analysis';
import { inspectInstallation, safeOrigin, safeSettings } from '@main/inspector/installation';
import { readRollout } from '@main/inspector/readRollout';
import { aggregateInspectorStats, compactAnalysis } from '@main/inspector/statistics';
import { isLocalRequest, createNativeWebHandler } from '@main/inspector/nativeServer';
import type { InspectorRateCard, InspectorSession, StatsQuery } from '@shared/inspector';

const baseSession: InspectorSession = {
  id: 'abc12345-0000-0000-0000-000000000000',
  filePath: '/tmp/rollout.jsonl',
  cwd: '/repo',
  startTime: '2026-01-01T00:00:00.000Z',
  model: 'gpt-5.2',
};

const envelope = (type: string, payload: Record<string, unknown>, timestamp = '2026-01-01T00:01:00.000Z') => ({
  timestamp,
  type,
  payload,
});

describe('inspector analysis', () => {
  it('validates rollout envelopes and rejects malformed ones', () => {
    expect(parseEnvelope(envelope('session_meta', {}))).not.toBeNull();
    expect(parseEnvelope({ timestamp: 'nope', type: 'x', payload: {} })).toBeNull();
    expect(parseEnvelope({ timestamp: '2026-01-01T00:00:00.000Z', type: '', payload: {} })).toBeNull();
    expect(parseEnvelope({ timestamp: '2026-01-01T00:00:00.000Z', type: 'x', payload: [1] })).toBeNull();
  });

  it('computes usage tokens with clamped cached and reasoning values', () => {
    expect(usageTokens({ input_tokens: 100, output_tokens: 40, cached_input_tokens: 120, reasoning_output_tokens: 50 }))
      .toEqual({ input: 100, cached: 100, output: 40, reasoning: 40, cacheWrite: 0 });
    expect(usageTokens({ input_tokens: 'x' })).toBeNull();
  });

  it('derives counter deltas and never double counts resets', () => {
    const previous = { input: 100, cached: 50, output: 20, reasoning: 5, cacheWrite: 0 };
    const next = { input: 160, cached: 80, output: 40, reasoning: 10, cacheWrite: 0 };
    expect(counterDelta(previous, next, null)).toEqual({ input: 60, cached: 30, output: 20, reasoning: 5, cacheWrite: 0 });
    expect(counterDelta(previous, previous, null)).toBeNull();
    expect(counterDelta(previous, { ...zeroTokens(), input: 10 }, null)).toBeNull();
  });

  it('pairs tool calls with their outputs and marks completion', () => {
    const analysis = analyzeSession(
      [
        envelope('turn_context', { model: 'gpt-5.2', turn_id: 't1' }),
        envelope('response_item', { type: 'message', role: 'user', content: [{ type: 'text', text: 'Hello' }] }),
        envelope('response_item', { type: 'function_call', name: 'shell', call_id: 'call1', arguments: '{}' }),
        envelope('response_item', { type: 'function_call_output', call_id: 'call1', output: 'ok', success: true }, '2026-01-01T00:02:00.000Z'),
      ],
      baseSession,
    );

    expect(analysis.rows.map((row) => row.kind)).toEqual(['message', 'command']);
    const call = analysis.rows[1];
    expect(call.status).toBe('completed');
    expect(call.durationMs).toBe(60_000);
    expect(call.detail).toContain('── Result ──');
    expect(analysis.session.title).toBe('Hello');
  });

  it('classifies event kinds', () => {
    const analysis = analyzeSession(
      [
        envelope('event_msg', { type: 'agent_reasoning', text: 'thinking' }),
        envelope('event_msg', { type: 'exec_command_begin', command: ['ls'] }),
        envelope('event_msg', { type: 'unknown_thing', foo: 1 }),
      ],
      baseSession,
    );
    expect(analysis.rows.map((row) => row.kind)).toEqual(['reasoning', 'command', 'event']);
  });
});

describe('inspector readRollout', () => {
  it('reads bounded JSONL and surfaces warnings for damaged lines', async () => {
    const file = path.join(tmpdir(), `rollout-${Date.now()}.jsonl`);
    const lines = [
      JSON.stringify(envelope('session_meta', { id: baseSession.id })),
      '{broken json',
      '',
      JSON.stringify(envelope('event_msg', { type: 'agent_message', message: 'done' })),
    ];
    await fs.writeFile(file, lines.join('\n'));

    const result = await readRollout(file);
    expect(result.entries).toHaveLength(2);
    expect(result.warnings.join('\n')).toMatch(/malformed|incomplete/i);
    await fs.unlink(file);
  });

  it('rejects directories instead of reading them', async () => {
    await expect(readRollout(tmpdir())).rejects.toThrow(/regular file/);
  });
});

describe('inspector statistics', () => {
  const rate: InspectorRateCard = {
    updatedAt: '2026-01-01T00:00:00.000Z',
    source: 'test',
    models: [
      { model: 'gpt-5.2', inputUsdPer1M: 1, cachedInputUsdPer1M: 0.1, outputUsdPer1M: 2, reasoningOutputUsdPer1M: 2 },
    ],
  };

  it('aggregates samples into daily series with prices and breakdown', () => {
    const analysis = analyzeSession(
      [
        envelope('event_msg', { type: 'agent_message', message: 'hi' }),
        envelope('token_usage_record', { response_id: 'r1', turn_id: 't1', usage: { input_tokens: 1000, output_tokens: 500, cached_input_tokens: 400 } }),
      ],
      baseSession,
    );

    const result = aggregateInspectorStats([compactAnalysis(analysis)], { bucket: 'day' }, rate, new Date('2026-01-02T00:00:00.000Z'));
    expect(result.totals.input).toBe(1000);
    expect(result.totals.cached).toBe(400);
    expect(result.totals.output).toBe(500);
    expect(result.totals.sessions).toBe(1);
    expect(result.series).toHaveLength(1);
    expect(result.series[0].points.length).toBeGreaterThan(0);
    expect(result.modelBreakdown[0]?.price).not.toBeNull();
    expect(result.hourly.some((hour) => hour.tokens > 0)).toBe(true);
  });

  it('rejects invalid ranges and timezones', () => {
    expect(() => aggregateInspectorStats([], { timezone: 'Not/AZone' }, rate)).toThrow(/timezone/i);
    expect(() => aggregateInspectorStats([], { from: '2026-01-05T00:00:00.000Z', to: '2026-01-01T00:00:00.000Z' }, rate)).toThrow(/range/);
    expect(() => aggregateInspectorStats([], { bucket: 'year' as StatsQuery['bucket'] }, rate)).toThrow(/bucket/);
  });
});

describe('inspector installation', () => {
  it('reads config.toml and lists skills with safe settings only', async () => {
    const home = path.join(tmpdir(), `cx-home-${Date.now()}`);
    await fs.mkdir(home, { recursive: true });
    await fs.mkdir(path.join(home, 'skills', 'demo'), { recursive: true });
    await fs.writeFile(
      path.join(home, 'config.toml'),
      'model = "gpt-5.2"\napproval_policy = "never"\napi_key = "secret"\n\n[mcp_servers.fetch]\ncommand = "fetch-mcp"\nargs = ["--x"]\nenv = { FETCH_TOKEN = "x" }\n',
    );
    await fs.writeFile(path.join(home, 'skills', 'demo', 'SKILL.md'), '---\nname: demo-skill\n---\nbody');

    const result = await inspectInstallation({
      home,
      userHome: path.join(tmpdir(), `cx-empty-${Date.now()}`),
      parseToml: () => ({
        model: 'gpt-5.2',
        approval_policy: 'never',
        api_key: 'secret',
        mcp_servers: {
          fetch: { command: 'fetch-mcp', args: ['--x'], env: { FETCH_TOKEN: 'x' } },
        },
        model_providers: {
          custom: { name: 'Custom', base_url: 'https://api.example.com/v1', env_key: 'CUSTOM_API_KEY' },
        },
      }),
      version: async () => 'codex-cli 0.1.0',
    });

    expect(result.home).toBe(home);
    expect(result.cliVersion).toBe('codex-cli 0.1.0');
    expect(result.configSources[0]?.status).toBe('read');
    expect(result.configSources[0]?.settings).toEqual({ model: 'gpt-5.2', approval_policy: 'never' });
    expect(result.mcp).toEqual([
      {
        name: 'fetch',
        source: path.join(home, 'config.toml'),
        enabled: true,
        transport: 'stdio',
        endpoint: 'fetch-mcp',
        argumentCount: 1,
        environmentNames: ['FETCH_TOKEN'],
      },
    ]);
    expect(result.providers).toEqual([
      {
        id: 'custom',
        name: 'Custom',
        source: path.join(home, 'config.toml'),
        endpoint: 'https://api.example.com',
        wireApi: 'Default',
        credentialVariable: 'CUSTOM_API_KEY',
      },
    ]);
    expect(result.skills.map((skill) => skill.name)).toContain('demo-skill');
    expect(result.warnings.join('\n')).toMatch(/not the complete live effective config/);
  });

  it('never echoes credentials or non-HTTP endpoints', () => {
    expect(safeOrigin('https://api.example.com/v1/secret?token=1')).toBe('https://api.example.com');
    expect(safeOrigin('ftp://host')).toBe('Non-HTTP endpoint');
    expect(safeOrigin('::not-a-url::')).toBe('Invalid endpoint');
    expect(safeSettings({ model: 'gpt-5.2', api_key: 'leak', features: { web_search: true } })).toEqual({
      model: 'gpt-5.2',
      'features.web_search': true,
    });
  });
});

describe('native web handler', () => {
  const port = 3456;

  const makeHandler = () =>
    createNativeWebHandler({
      inspector: {
        getInspectorSessions: async () => [baseSession],
        getInspectorTrace: async () => {
          throw new Error('Session not found. Refresh the session list.');
        },
        getInspectorStats: async () => {
          throw new Error('The date range is invalid.');
        },
        getInspectorInstallation: async () => {
          throw new Error('Select a discovered project before inspecting its configuration.');
        },
      },
      context: {
        getProjects: async () => [],
        getSessions: async () => [],
        getSessionDetail: async () => null,
        getSessionChunks: async () => null,
        getStats: async () => ({}),
        getModelRates: async () => ({ updatedAt: null, source: null, models: [], warnings: [] }),
        refreshModelRates: async () => ({}),
        searchSessions: async () => ({ results: [] }),
        getConfig: () => ({}),
        updateConfig: () => null,
        onFileChange: () => () => undefined,
      },
      rendererRoot: tmpdir(),
      port,
      version: '0.0.0-test',
      checkUpdate: async () => ({}),
    });

  it('accepts loopback same-origin requests and rejects remote ones', () => {
    const local = new Request(`http://127.0.0.1:${port}/version`);
    const remote = new Request('https://evil.example/version');
    expect(isLocalRequest(local, port)).toBe(true);
    expect(isLocalRequest(remote, port)).toBe(false);
  });

  it('serves inspector endpoints with hardened headers and safe errors', async () => {
    const handler = makeHandler();

    const sessions = await handler(new Request(`http://127.0.0.1:${port}/inspector/sessions`));
    expect(sessions.status).toBe(200);
    expect(sessions.headers.get('x-content-type-options')).toBe('nosniff');
    expect(sessions.headers.get('x-frame-options')).toBe('DENY');
    expect(await sessions.json()).toEqual([baseSession]);

    const traceError = await handler(
      new Request(`http://127.0.0.1:${port}/inspector/trace?query=${encodeURIComponent(JSON.stringify({ sessionId: 'missing' }))}`),
    );
    expect(traceError.status).toBe(400);
    expect(await traceError.json()).toEqual({ error: 'Session not found. Refresh the session list.' });

    const dateError = await handler(
      new Request(`http://127.0.0.1:${port}/inspector/stats?query=${encodeURIComponent(JSON.stringify({}))}`),
    );
    expect(await dateError.json()).toEqual({ error: 'The date range is invalid.' });

    const version = await handler(new Request(`http://127.0.0.1:${port}/version`));
    expect(await version.text()).toBe('0.0.0-test');
  });

  it('rejects cross-origin and oversized queries', async () => {
    const handler = makeHandler();
    const foreign = await handler(
      new Request(`http://127.0.0.1:${port}/version`, { headers: { origin: 'https://evil.example' } }),
    );
    expect(foreign.status).toBe(403);

    const big = `http://127.0.0.1:${port}/inspector/trace?query=${encodeURIComponent(JSON.stringify({ sessionId: 'x' })).padEnd(9000, 'a')}`;
    const oversized = await handler(new Request(big));
    expect(oversized.status).toBe(400);

    const badKind = await handler(
      new Request(`http://127.0.0.1:${port}/inspector/trace?query=${encodeURIComponent(JSON.stringify({ sessionId: 'x', kind: 'nope' }))}`),
    );
    expect(await badKind.json()).toEqual({ error: 'Unknown trace category.' });
  });
});
