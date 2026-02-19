import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { parseJsonlFile, readFirstJsonlEntry } from '../../src/main/utils/jsonl';

describe('jsonl utils', () => {
  it('parses JSONL line by line and skips malformed lines', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'codex-jsonl-test-'));
    const filePath = path.join(dir, 'sample.jsonl');
    writeFileSync(filePath, ['{"ok":1}', 'not-json', '{"ok":2}'].join('\n'), 'utf8');

    const entries = await parseJsonlFile<{ ok: number }>(
      filePath,
      (value) =>
        typeof value === 'object' &&
        value !== null &&
        typeof (value as { ok?: unknown }).ok === 'number'
          ? (value as { ok: number })
          : null,
    );
    expect(entries).toEqual([{ ok: 1 }, { ok: 2 }]);

    const first = await readFirstJsonlEntry<{ ok: number }>(
      filePath,
      (value) =>
        typeof value === 'object' &&
        value !== null &&
        typeof (value as { ok?: unknown }).ok === 'number'
          ? (value as { ok: number })
          : null,
    );
    expect(first).toEqual({ ok: 1 });

    rmSync(dir, { recursive: true, force: true });
  });

  it('readFirstJsonlEntry returns the first matching parsed entry across lines', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'codex-jsonl-test-'));
    const filePath = path.join(dir, 'sample-non-first-match.jsonl');
    writeFileSync(filePath, ['{"kind":"skip"}', 'not-json', '{"kind":"target","id":7}'].join('\n'), 'utf8');

    const firstMatch = await readFirstJsonlEntry<{ kind: string; id: number }>(
      filePath,
      (value) => {
        if (
          typeof value === 'object' &&
          value !== null &&
          (value as { kind?: unknown }).kind === 'target' &&
          typeof (value as { id?: unknown }).id === 'number'
        ) {
          return value as { kind: string; id: number };
        }

        return null;
      },
    );

    expect(firstMatch).toEqual({ kind: 'target', id: 7 });

    rmSync(dir, { recursive: true, force: true });
  });
});
