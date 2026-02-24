import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type PackageManifest = {
  files?: string[];
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function readPackageJson(): PackageManifest {
  const packagePath = join(process.cwd(), 'package.json');
  return JSON.parse(readFileSync(packagePath, 'utf8')) as PackageManifest;
}

describe('package manifest guardrails', () => {
  it('does not publish desktop build artifacts and keeps prepack lightweight', () => {
    const pkg = readPackageJson();

    expect(pkg.files ?? []).not.toContain('build/**');
    expect(pkg.scripts?.prepack).toBe('pnpm build:renderer');
  });

  it('uses direct electrobun scripts without wrapper indirection', () => {
    const pkg = readPackageJson();
    const scripts = pkg.scripts ?? {};

    expect(scripts.dev).toContain('electrobun dev --console');
    expect(scripts['build:desktop']).toBe('electrobun build --env=dev');
    expect(scripts.dist).toContain('electrobun build --env=stable');

    for (const script of Object.values(scripts)) {
      expect(script).not.toContain('scripts/electrobun-');
    }
  });

  it('pins runtime-critical tools to explicit versions', () => {
    const pkg = readPackageJson();

    expect(pkg.dependencies?.electrobun).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.devDependencies?.['@types/bun']).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.devDependencies?.concurrently).toMatch(/^\d+\.\d+\.\d+$/);

    expect(pkg.dependencies?.electrobun).not.toBe('latest');
    expect(pkg.devDependencies?.['@types/bun']).not.toBe('latest');
    expect(pkg.devDependencies?.concurrently).not.toBe('latest');
  });
});
