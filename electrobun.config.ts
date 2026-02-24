import type { ElectrobunConfig } from 'electrobun';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

const aliasEntries = [
  { prefix: '@main/', targetDir: resolve(rootDir, 'src/main') },
  { prefix: '@renderer/', targetDir: resolve(rootDir, 'src/renderer') },
  { prefix: '@shared/', targetDir: resolve(rootDir, 'src/shared') },
] as const;

const aliasPlugin = {
  name: 'codex-devtools-aliases',
  setup(build: {
    onResolve: (
      options: { filter: RegExp },
      callback: (args: { path: string }) => { path: string } | void,
    ) => void;
  }) {
    for (const entry of aliasEntries) {
      build.onResolve({ filter: new RegExp(`^${entry.prefix.replace('/', '\\/')}`) }, (args) => {
        const relativePath = args.path.slice(entry.prefix.length);
        const basePath = resolve(entry.targetDir, relativePath);
        const candidate = [
          `${basePath}.ts`,
          `${basePath}.tsx`,
          `${basePath}.js`,
          `${basePath}.mjs`,
          resolve(basePath, 'index.ts'),
          resolve(basePath, 'index.tsx'),
          resolve(basePath, 'index.js'),
          basePath,
        ].find((path) => {
          if (!existsSync(path)) {
            return false;
          }

          try {
            return statSync(path).isFile();
          } catch {
            return false;
          }
        });

        return { path: candidate ?? basePath };
      });
    }
  },
};

export default {
  app: {
    name: 'codex-devtools',
    identifier: 'com.codex.devtools',
    version: '0.1.0',
  },
  runtime: {
    exitOnLastWindowClosed: true,
  },
  build: {
    bun: {
      entrypoint: 'src/bun/index.ts',
      plugins: [aliasPlugin],
    },
    copy: {
      'dist/index.html': 'views/mainview/index.html',
      'dist/assets': 'views/mainview/assets',
    },
    mac: {
      bundleCEF: false,
      icons: 'resources/icon.iconset',
    },
    linux: {
      bundleCEF: true,
      icon: 'resources/icon.png',
    },
    win: {
      bundleCEF: false,
      icon: 'resources/icon.png',
    },
  },
} satisfies ElectrobunConfig;
