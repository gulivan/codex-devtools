import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI_ENTRYPOINT = join(process.cwd(), 'bin', 'codex-devtools.cjs');
const describeUnixOnly = process.platform === 'win32' ? describe.skip : describe;

function writeExecutable(filePath: string, content: string): void {
  writeFileSync(filePath, content, 'utf8');
  chmodSync(filePath, 0o755);
}

function runCli(args: string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [CLI_ENTRYPOINT, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
    },
  });
}

describeUnixOnly('cli entrypoint', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'codex-cli-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('fails fast with a clear error when Bun is unavailable', () => {
    const result = runCli(['--web'], { PATH: tempDir });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Bun is required to run this app.');
  });

  it('routes desktop mode to electrobun via local dependency', () => {
    const commandLog = join(tempDir, 'desktop-command.log');
    const electrobunEntrypoint = join(
      process.cwd(),
      'node_modules',
      'electrobun',
      'bin',
      'electrobun.cjs',
    );

    writeExecutable(
      join(tempDir, 'bun'),
      `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "1.3.8"
  exit 0
fi
echo "$@" > "${commandLog}"
exit 0
`,
    );

    const result = runCli(['--desktop', '--flag'], { PATH: tempDir });

    expect(result.status).toBe(0);
    const command = readFileSync(commandLog, 'utf8').trim();
    expect(command).toBe(`${electrobunEntrypoint} dev --console --flag`);
  });

  it('routes standalone mode to bun run src/main/standalone.ts', () => {
    const commandLog = join(tempDir, 'web-command.log');

    writeExecutable(
      join(tempDir, 'bun'),
      `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "1.3.8"
  exit 0
fi
echo "$@" > "${commandLog}"
exit 0
`,
    );
    const result = runCli(['--web', '--port=4000'], { PATH: tempDir });

    expect(result.status).toBe(0);
    const command = readFileSync(commandLog, 'utf8').trim();
    expect(command).toBe('run src/main/standalone.ts --port=4000');
  });
});
