import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { createLogger } from '@shared/utils/logger';

const logger = createLogger('Service:FileWatcher');

const DEBOUNCE_MS = 100;

export interface CodexFileChangeEvent {
  filePath: string;
  eventType: 'created' | 'changed' | 'deleted';
  timestamp: string;
}

export class FileWatcher extends EventEmitter {
  private readonly sessionsPath: string;
  private watcher: fs.FSWatcher | null = null;
  private readonly debounceTimers = new Map<string, NodeJS.Timeout>();

  constructor(sessionsPath: string = path.join(os.homedir(), '.codex', 'sessions')) {
    super();
    this.sessionsPath = sessionsPath;
  }

  start(): void {
    if (this.watcher) {
      return;
    }

    try {
      this.watcher = fs.watch(
        this.sessionsPath,
        { recursive: true },
        (eventType, filename) => {
          if (!filename) {
            return;
          }

          const targetPath = path.join(this.sessionsPath, String(filename));
          this.handleFsEvent(eventType, targetPath);
        },
      );
    } catch (error) {
      logger.error(`Failed to start watcher for ${this.sessionsPath}`, error);
    }
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  dispose(): void {
    this.stop();
    this.removeAllListeners();
  }

  onFileChange(listener: (event: CodexFileChangeEvent) => void): () => void {
    this.on('file-change', listener);
    return () => this.off('file-change', listener);
  }

  handleFsEvent(rawEventType: string, targetPath: string): void {
    const baseName = path.basename(targetPath);
    if (!/^rollout-.*\.jsonl$/.test(baseName)) {
      return;
    }

    const existingTimer = this.debounceTimers.get(targetPath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(targetPath);
      const event: CodexFileChangeEvent = {
        filePath: targetPath,
        eventType: this.resolveEventType(rawEventType, targetPath),
        timestamp: new Date().toISOString(),
      };
      this.emit('file-change', event);
    }, DEBOUNCE_MS);

    this.debounceTimers.set(targetPath, timer);
  }

  private resolveEventType(rawEventType: string, targetPath: string): 'created' | 'changed' | 'deleted' {
    if (rawEventType !== 'rename') {
      return 'changed';
    }

    return fs.existsSync(targetPath) ? 'created' : 'deleted';
  }
}
