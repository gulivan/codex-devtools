import { mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  ConfigManager,
  DataCache,
  FileWatcher,
} from '../../src/main/services/infrastructure';

describe('DataCache', () => {
  it('evicts least recently used entries when max size is exceeded', () => {
    const cache = new DataCache<number>(2, 10);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });
});

describe('ConfigManager', () => {
  it('uses dark theme by default on first load', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'codex-config-default-test-'));
    const configPath = path.join(dir, 'config.json');

    const manager = new ConfigManager(configPath);
    expect(manager.getConfig().display.theme).toBe('dark');

    rmSync(dir, { recursive: true, force: true });
  });

  it('persists config updates to disk', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'codex-config-test-'));
    const configPath = path.join(dir, 'config.json');

    const manager = new ConfigManager(configPath);
    manager.updateSection('display', { showReasoning: false, theme: 'dark' });

    const reloaded = new ConfigManager(configPath);
    expect(reloaded.getConfig().display.showReasoning).toBe(false);
    expect(reloaded.getConfig().display.theme).toBe('dark');

    rmSync(dir, { recursive: true, force: true });
  });
});

describe('FileWatcher', () => {
  it('debounces multiple fs events into one file-change event', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'codex-watcher-test-'));
    const watcher = new FileWatcher(dir);

    const events: string[] = [];
    watcher.onFileChange((event) => {
      events.push(event.filePath);
    });

    const target = path.join(dir, 'rollout-2026-02-18T22-00-00-session-1.jsonl');
    watcher.handleFsEvent('change', target);
    watcher.handleFsEvent('change', target);
    watcher.handleFsEvent('change', target);

    await new Promise((resolve) => setTimeout(resolve, 180));
    expect(events).toHaveLength(1);

    watcher.dispose();
    rmSync(dir, { recursive: true, force: true });
  });
});
