# codex-devtools

Desktop app for inspecting Codex session data.

## Prerequisites

- Node.js 20+ (Node 24 works)
- `pnpm` 10 (via Corepack recommended)

## Build and run

```bash
cd /Users/ivan/git/codex-devtools
corepack enable
pnpm install
pnpm approve-builds
```

In `pnpm approve-builds`, approve:

- `electron`
- `esbuild`

Then start the desktop app in development mode:

```bash
pnpm dev
```

## Production build

```bash
pnpm build
```

Build artifacts are generated in:

- `dist-electron`
- `out/renderer`

Create desktop installers/packages locally:

```bash
pnpm dist
```

Platform-specific package commands:

- `pnpm dist:mac` (macOS: `.dmg`, `.zip`)
- `pnpm dist:win` (Windows: NSIS installer)
- `pnpm dist:linux` (Linux: AppImage, `.deb`, `.rpm`)

## Standalone mode

Run as an HTTP server (without launching Electron):

```bash
pnpm standalone
```

Default URL:

- `http://localhost:3456`

## Environment variables

- `CODEX_SESSIONS_PATH`: path to Codex sessions directory (default: `~/.codex/sessions`)
- `HOST`: standalone server host (default: `0.0.0.0`)
- `PORT`: standalone server port (default: `3456`)

## Scripts

- `pnpm dev`: start Electron app in dev mode
- `pnpm build`: build renderer + Electron main/preload
- `pnpm dist`: build macOS + Windows + Linux packages
- `pnpm dist:mac`: build macOS packages
- `pnpm dist:win`: build Windows installer
- `pnpm dist:linux`: build Linux packages
- `pnpm standalone`: build and run standalone HTTP server
- `pnpm test`: run tests with Vitest
- `pnpm lint`: run ESLint
- `pnpm typecheck`: run TypeScript type checks

## CI/CD

- `.github/workflows/ci.yml`: typecheck/lint/build/test on `main` and PRs.
- `.github/workflows/release.yml`: cross-platform packaging on semver tags (`v*`) and manual dispatch.
- `.github/workflows/npm-publish.yml`: npm publish on semver tags (`v*`) and manual dispatch.

Required GitHub repository secret for npm publishing:

- `NPM_TOKEN`: npm automation token (or granular token with publish + 2FA bypass).

## Versioning (SemVer)

Releases use semantic version tags:

- `vMAJOR.MINOR.PATCH` (example: `v0.1.1`)
- optional pre-release/build metadata (`v1.2.3-beta.1`, `v1.2.3+build.4`)

Tag and publish flow:

```bash
npm version patch
git push origin main --follow-tags
```

`release.yml` and `npm-publish.yml` validate tag format and fail if the tag is not valid SemVer.

## Troubleshooting

If `pnpm dev` fails with `Electron failed to install correctly` or `Electron uninstall`:

1. Run `pnpm approve-builds`
2. Approve `electron` and `esbuild`
3. Run `pnpm install` again
4. Retry `pnpm dev`
