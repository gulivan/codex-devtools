#!/usr/bin/env node
'use strict';

const { existsSync } = require('node:fs');
const { join } = require('node:path');
const { spawn } = require('node:child_process');

const APP_ROOT = join(__dirname, '..');
const ELECTRON_ENTRY = join(APP_ROOT, 'dist-electron', 'main', 'index.cjs');
const STANDALONE_ENTRY = join(APP_ROOT, 'dist-electron', 'main', 'standalone.cjs');

function hasArg(flag) {
  return process.argv.includes(flag);
}

function runStandalone() {
  if (!existsSync(STANDALONE_ENTRY)) {
    console.error('[codex-devtools] Missing standalone bundle. Reinstall package and try again.');
    process.exit(1);
  }

  const standaloneModule = require(STANDALONE_ENTRY);
  if (typeof standaloneModule.startStandaloneCli !== 'function') {
    console.error('[codex-devtools] Invalid standalone entrypoint: startStandaloneCli export not found.');
    process.exit(1);
  }

  standaloneModule.startStandaloneCli();
}

function runDesktop() {
  if (!existsSync(ELECTRON_ENTRY)) {
    console.error('[codex-devtools] Missing Electron bundle. Reinstall package and try again.');
    process.exit(1);
  }

  let electronBinary;
  try {
    electronBinary = require('electron');
  } catch (error) {
    console.error(
      '[codex-devtools] Electron runtime is not available. Reinstall package and ensure install scripts are enabled.',
    );
    if (error && error.message) {
      console.error(`[codex-devtools] ${error.message}`);
    }
    process.exit(1);
  }

  const forwardedArgs = process.argv.slice(2).filter((arg) => arg !== '--desktop');
  const child = spawn(electronBinary, [APP_ROOT, ...forwardedArgs], {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('error', (error) => {
    console.error('[codex-devtools] Failed to launch Electron.', error);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

if (hasArg('--help') || hasArg('-h')) {
  console.log('codex-devtools');
  console.log('');
  console.log('Usage:');
  console.log('  codex-devtools           Launch Electron desktop app (default)');
  console.log('  codex-devtools --web     Run standalone HTTP mode');
  console.log('  codex-devtools --desktop Force desktop mode');
  process.exit(0);
}

if (hasArg('--web') || hasArg('--standalone')) {
  runStandalone();
} else {
  runDesktop();
}
