import { type ReadStream, createReadStream } from 'node:fs';
import * as readline from 'node:readline';

import { createLogger } from '@shared/utils/logger';

const logger = createLogger('Main:jsonl');

type JsonlParser<T> = (value: unknown, lineNumber: number) => T | null;

export interface StreamJsonlOptions<T> {
  parser?: JsonlParser<T>;
  onEntry: (entry: T, lineNumber: number) => void | Promise<void>;
  onError?: (error: unknown, line: string, lineNumber: number) => void;
}

const defaultParser = <T>(value: unknown): T => value as T;

function waitForStreamClose(stream: ReadStream): Promise<void> {
  if (stream.closed) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const done = (): void => {
      stream.off('close', done);
      stream.off('error', done);
      resolve();
    };

    stream.once('close', done);
    stream.once('error', done);
  });
}

async function closeReaderAndStream(reader: readline.Interface, stream: ReadStream): Promise<void> {
  const closePromise = waitForStreamClose(stream);
  reader.close();
  if (!stream.destroyed) {
    stream.destroy();
  }
  await closePromise;
}

export async function streamJsonlFile<T = unknown>(
  filePath: string,
  options: StreamJsonlOptions<T>,
): Promise<void> {
  const parser = options.parser ?? defaultParser<T>;
  const stream = createReadStream(filePath, { encoding: 'utf8' });
  const reader = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  let lineNumber = 0;
  try {
    for await (const line of reader) {
      lineNumber += 1;
      if (!line.trim()) {
        continue;
      }

      try {
        const raw = JSON.parse(line) as unknown;
        const parsed = parser(raw, lineNumber);
        if (parsed !== null) {
          await options.onEntry(parsed, lineNumber);
        }
      } catch (error) {
        options.onError?.(error, line, lineNumber);
        if (!options.onError) {
          logger.warn(`Failed to parse JSONL line ${lineNumber} in ${filePath}`, error);
        }
      }
    }
  } finally {
    await closeReaderAndStream(reader, stream);
  }
}

export async function parseJsonlFile<T = unknown>(
  filePath: string,
  parser?: JsonlParser<T>,
): Promise<T[]> {
  const entries: T[] = [];
  await streamJsonlFile<T>(filePath, {
    parser,
    onEntry: (entry) => {
      entries.push(entry);
    },
  });
  return entries;
}

export async function readFirstJsonlEntry<T = unknown>(
  filePath: string,
  parser?: JsonlParser<T>,
): Promise<T | null> {
  const entryParser = parser ?? defaultParser<T>;
  const stream = createReadStream(filePath, { encoding: 'utf8' });
  const reader = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  let lineNumber = 0;
  let firstEntry: T | null = null;
  try {
    for await (const line of reader) {
      lineNumber += 1;
      if (!line.trim()) {
        continue;
      }

      try {
        const raw = JSON.parse(line) as unknown;
        const parsed = entryParser(raw, lineNumber);
        if (parsed !== null) {
          firstEntry = parsed;
          break;
        }
      } catch (error) {
        logger.warn(`Failed to parse JSONL line ${lineNumber} in ${filePath}`, error);
      }
    }
  } finally {
    await closeReaderAndStream(reader, stream);
  }

  return firstEntry;
}
