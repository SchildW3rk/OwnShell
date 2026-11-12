# OwnShell

OwnShell is a local-first desktop DevOps workspace built with Electron. It combines SSH terminals, SFTP, S3 object storage, Docker, database clients, an encrypted vault for credentials and environment variables, and an API client in one app.

Workspace data (hosts, keys, credentials, environments) is stored locally in an encrypted SQLite database protected by a master password. No account is needed for personal use, and the app sends no automatic crash or diagnostics reports. Paid license activation contacts the licensing API.

Team Vaults / encrypted sync are on the roadmap and are not part of the app today.

## Building from source

Requirements: Node.js 22, npm 10, macOS (release packaging is currently macOS arm64 only). Native modules (`better-sqlite3`, `node-pty`, `ssh2`) are rebuilt for Electron on install, so a C/C++ toolchain (Xcode Command Line Tools) is required.

```bash
git clone https://github.com/SchildW3rk/OwnShell.git
cd OwnShell
npm ci

# Run the desktop app in development mode
npm run build --workspace=@ownshell/core
npm run build --workspace=@ownshell/ui
npm run dev:electron --workspace=ownshell-desktop

# Type-check and build the renderer/main bundles
npm run build:vite --workspace=ownshell-desktop

# Run the tests (all apps/desktop/scripts/*.test.ts)
npm test

# Package the macOS app into apps/desktop/release/ (signing needs your own Developer ID)
npm run build --workspace=ownshell-desktop
```

In development mode the database is seeded with sample data and the master password `dev123`.

## Repository layout

- `apps/desktop` - Electron app (`src/` renderer, `electron/` main process, `scripts/` build helpers and tests)
- `apps/landing` - marketing website
- `apps/license-api` - licensing API (Cloudflare Worker)
- `packages/core`, `packages/ui`, `packages/theme`, `packages/config` - shared code and config
- `docs` - user documentation (VitePress)

## Contributing

Issues and pull requests are welcome. Keep changes small and follow existing patterns; run `npm run build:vite --workspace=ownshell-desktop` and `npm test` before opening a PR. See `AGENTS.md` for repository conventions.

## License

MIT - see [LICENSE](LICENSE).
