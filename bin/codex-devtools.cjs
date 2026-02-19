#!/usr/bin/env node
'use strict';

const { copyFileSync, existsSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const APP_ROOT = join(__dirname, '..');
const ELECTRON_ENTRY = join(APP_ROOT, 'dist-electron', 'main', 'index.cjs');
const STANDALONE_ENTRY = join(APP_ROOT, 'dist-electron', 'main', 'standalone.cjs');
const APP_DISPLAY_NAME = 'codex-devtools';
const APP_BUNDLE_ID = 'com.codex.devtools.dev';

function hasArg(flag) {
  return process.argv.includes(flag);
}

function runCommand(command, args) {
  const result = spawnSync(command, args, { stdio: 'ignore' });
  return result.status === 0;
}

function patchMacElectronBundle(electronBinary) {
  if (process.platform !== 'darwin') {
    return;
  }

  try {
    const appContents = resolve(electronBinary, '..', '..');
    const plistPath = join(appContents, 'Info.plist');
    const sourceIcon = join(APP_ROOT, 'resources', 'icon.icns');
    const targetIcon = join(appContents, 'Resources', 'electron.icns');

    if (!existsSync(plistPath)) {
      return;
    }

    const replacements = [
      ['CFBundleDisplayName', APP_DISPLAY_NAME],
      ['CFBundleName', APP_DISPLAY_NAME],
      ['CFBundleIdentifier', APP_BUNDLE_ID],
    ];

    for (const [key, value] of replacements) {
      runCommand('plutil', ['-replace', key, '-string', value, plistPath]);
    }

    if (existsSync(sourceIcon)) {
      copyFileSync(sourceIcon, targetIcon);
    }
  } catch {
    // Best effort only; launch should continue even if patching fails.
  }
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

  patchMacElectronBundle(electronBinary);

  const forwardedArgs = process.argv.slice(2).filter((arg) => arg !== '--desktop');
  const child = spawn(electronBinary, [APP_ROOT, ...forwardedArgs], {
    stdio: 'inherit',
    env: process.env,
    argv0: APP_DISPLAY_NAME,
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
