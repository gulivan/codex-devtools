import { copyFileSync, existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DISPLAY_NAME = 'codex-devtools';
const APP_BUNDLE_ID = 'com.codex.devtools.dev';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = dirname(__dirname);

function runCommand(command, args) {
  const result = spawnSync(command, args, { stdio: 'ignore' });
  return result.status === 0;
}

function patchMacElectronBundle() {
  if (process.platform !== 'darwin') {
    return;
  }

  const appContents = join(rootDir, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents');
  const plistPath = join(appContents, 'Info.plist');
  const sourceIcon = join(rootDir, 'resources', 'icon.icns');
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
}

patchMacElectronBundle();

const electronViteCli = join(rootDir, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js');
const child = spawn(process.execPath, [electronViteCli, 'dev'], {
  cwd: rootDir,
  env: process.env,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on('error', () => {
  process.exit(1);
});
