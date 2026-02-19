import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const requiredDirectories = [
  'resources',
  'resources/icons',
  'resources/icons/png',
  'src/renderer/api',
  'src/renderer/store/slices',
  'src/renderer/components/chat',
  'src/renderer/components/chat/viewers',
  'src/renderer/components/chat/items',
  'src/renderer/components/sidebar',
  'src/renderer/components/settings',
  'src/renderer/components/badges',
  'src/renderer/components/panels',
  'src/renderer/components/dashboard',
  'src/renderer/components/search',
  'src/renderer/hooks',
  'src/renderer/types',
  'src/renderer/utils',
  'test/services',
  'test/fixtures',
  'build'
];

const requiredBarrelFiles = [
  'src/main/ipc/index.ts',
  'src/main/utils/index.ts',
  'src/preload/constants/index.ts',
  'src/renderer/index.ts',
  'src/renderer/components/chat/index.ts',
  'src/renderer/components/chat/items/index.ts',
  'src/renderer/components/chat/viewers/index.ts',
  'src/renderer/components/common/index.ts',
  'src/renderer/components/dashboard/index.ts',
  'src/renderer/components/layout/index.ts',
  'src/renderer/components/settings/index.ts',
  'src/renderer/components/sidebar/index.ts',
  'src/renderer/store/slices/index.ts',
  'src/shared/utils/index.ts',
];

describe('scaffold structure', () => {
  it.each(requiredDirectories)('contains directory %s', (directory) => {
    const fullPath = join(repoRoot, directory);
    const exists = existsSync(fullPath);

    expect(exists).toBe(true);
    if (exists) {
      expect(statSync(fullPath).isDirectory()).toBe(true);
    }
  });

  it.each(requiredBarrelFiles)('contains barrel file %s', (filePath) => {
    const fullPath = join(repoRoot, filePath);
    const exists = existsSync(fullPath);

    expect(exists).toBe(true);
    if (exists) {
      expect(statSync(fullPath).isFile()).toBe(true);
    }
  });
});
