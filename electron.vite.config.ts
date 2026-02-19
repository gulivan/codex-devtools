import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@main': resolve(__dirname, 'src/main'),
        '@preload': resolve(__dirname, 'src/preload'),
        '@renderer': resolve(__dirname, 'src/renderer'),
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    build: {
      outDir: 'dist-electron/main',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          standalone: resolve(__dirname, 'src/main/standalone.ts')
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@main': resolve(__dirname, 'src/main'),
        '@preload': resolve(__dirname, 'src/preload'),
        '@renderer': resolve(__dirname, 'src/renderer'),
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    build: {
      outDir: 'dist-electron/preload',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/entry.ts')
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@main': resolve(__dirname, 'src/main'),
        '@preload': resolve(__dirname, 'src/preload'),
        '@renderer': resolve(__dirname, 'src/renderer'),
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    build: {
      target: 'es2019',
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    }
  }
});
