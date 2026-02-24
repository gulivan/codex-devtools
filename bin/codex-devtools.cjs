#!/usr/bin/env node
'use strict';

const { spawn, spawnSync } = require('node:child_process');
const { join } = require('node:path');

const APP_ROOT = join(__dirname, '..');
const APP_DISPLAY_NAME = 'codex-devtools';

function hasArg(flag) {
  return process.argv.includes(flag);
}

function hasCommand(command) {
  const result = spawnSync(command, ['--version'], { stdio: 'ignore' });
  return result.status === 0;
}

function runChild(command, args) {
  const child = spawn(command, args, {
    cwd: APP_ROOT,
    stdio: 'inherit',
    env: process.env,
  });

  child.on('error', (error) => {
    console.error(`[${APP_DISPLAY_NAME}] Failed to launch command: ${command}`, error);
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

function ensureBun() {
  if (hasCommand('bun')) {
    return;
  }

  console.error(`[${APP_DISPLAY_NAME}] Bun is required to run this app.`);
  console.error(`[${APP_DISPLAY_NAME}] Install Bun: https://bun.sh`);
  process.exit(1);
}

function runStandalone() {
  ensureBun();
  const forwardedArgs = process.argv.slice(2).filter((arg) => arg !== '--web' && arg !== '--standalone');
  runChild('bun', ['run', 'src/main/standalone.ts', ...forwardedArgs]);
}

function runDesktop() {
  ensureBun();
  const forwardedArgs = process.argv.slice(2).filter((arg) => arg !== '--desktop');
  runChild('bunx', ['electrobun', 'dev', '--console', ...forwardedArgs]);
}

if (hasArg('--help') || hasArg('-h')) {
  console.log('codex-devtools');
  console.log('');
  console.log('Usage:');
  console.log('  codex-devtools           Launch Electrobun desktop app (default)');
  console.log('  codex-devtools --web     Run standalone HTTP mode');
  console.log('  codex-devtools --desktop Force desktop mode');
  console.log('');
  console.log('Environment:');
  console.log('  CODEX_DEVTOOLS_DEFAULT_MODE=web   Use web mode by default');
  process.exit(0);
}

if (hasArg('--web') || hasArg('--standalone')) {
  runStandalone();
} else if (hasArg('--desktop')) {
  runDesktop();
} else if ((process.env.CODEX_DEVTOOLS_DEFAULT_MODE || '').toLowerCase() === 'web') {
  runStandalone();
} else {
  runDesktop();
}
