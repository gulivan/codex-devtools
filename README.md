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
- `.github/workflows/release.yml`: cross-platform packaging on tags (`v*`) and manual dispatch.
- `.github/workflows/npm-publish.yml`: npm publish on tags (`v*`) and manual dispatch.

Required GitHub repository secret for npm publishing:

- `NPM_TOKEN`: npm automation token with publish access.

## Troubleshooting

If `pnpm dev` fails with `Electron failed to install correctly` or `Electron uninstall`:

1. Run `pnpm approve-builds`
2. Approve `electron` and `esbuild`
3. Run `pnpm install` again
4. Retry `pnpm dev`
