import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readReleaseWorkflow(): string {
  return readFileSync(join(process.cwd(), '.github', 'workflows', 'release.yml'), 'utf8');
}

describe('release workflow guardrails', () => {
  it('uploads packaged artifacts from electrobun output directory', () => {
    const workflow = readReleaseWorkflow();
    const matches = workflow.match(/path:\s*artifacts\/\*\*/g) ?? [];

    expect(matches).toHaveLength(3);
    expect(workflow).not.toContain('path: build/**');
  });

  it('keeps electrobun update metadata and tarball upload patterns', () => {
    const workflow = readReleaseWorkflow();

    expect(workflow).toContain('*.tar.zst');
    expect(workflow).toContain('*-update.json');
  });
});
