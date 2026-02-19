#!/usr/bin/env node
'use strict';

const { existsSync } = require('node:fs');
const { join } = require('node:path');

const standaloneEntrypoint = join(__dirname, '..', 'dist-electron', 'main', 'standalone.cjs');

if (!existsSync(standaloneEntrypoint)) {
  console.error(
    '[codex-devtools] Missing standalone bundle. Reinstall package or run a version that includes dist-electron output.',
  );
  process.exit(1);
}

const standaloneModule = require(standaloneEntrypoint);

if (typeof standaloneModule.startStandaloneCli !== 'function') {
  console.error('[codex-devtools] Invalid standalone entrypoint: startStandaloneCli export not found.');
  process.exit(1);
}

standaloneModule.startStandaloneCli();
