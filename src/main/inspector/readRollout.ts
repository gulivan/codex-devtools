import { createReadStream, promises as fs } from 'node:fs';
import { createInterface } from 'node:readline';
import type { RolloutEnvelope } from '../../shared/inspector';
import { parseEnvelope } from './analysis';

export interface ReadLimits { fileBytes: number; lineBytes: number; entries: number }
export const DEFAULT_READ_LIMITS: ReadLimits = { fileBytes: 64 * 1024 * 1024, lineBytes: 2 * 1024 * 1024, entries: 100_000 };
/** Read-only, bounded JSONL ingestion. Damage/limits are surfaced, never silently represented as complete history. */
export async function readRollout(filePath: string, limits: ReadLimits = DEFAULT_READ_LIMITS): Promise<{ entries: RolloutEnvelope[]; warnings: string[] }> {
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) throw new Error('The session path is not a regular file.');
  if (stat.size > limits.fileBytes) return { entries: [], warnings: ['A rollout exceeded the 64 MiB inspection limit and was excluded. Its usage is not included.'] };
  const stream = createReadStream(filePath, { encoding: 'utf8' });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  const entries: RolloutEnvelope[] = [], warnings = new Set<string>();
  let bytes = 0;
  try {
    for await (const line of lines) {
      bytes += Buffer.byteLength(line) + 1;
      if (bytes > limits.fileBytes || entries.length >= limits.entries) { warnings.add('Inspection limit reached. This session and its usage are partial.'); break; }
      if (!line.trim()) continue;
      if (Buffer.byteLength(line) > limits.lineBytes) { warnings.add('An oversized record was skipped. This capture may be incomplete.'); continue; }
      try {
        const entry = parseEnvelope(JSON.parse(line));
        if (entry) entries.push(entry); else warnings.add('A malformed rollout envelope was skipped.');
      } catch { warnings.add('An incomplete or malformed JSONL record was skipped; it may still be being written.'); }
    }
  } finally { lines.close(); stream.destroy(); }
  return { entries, warnings: [...warnings] };
}
