# OwnShell Agent Guide

Fast entrypoint for agents working in this repository. Contributor-useful agent context lives in `.agents/`.

## Repo Shape

- `apps/desktop`: Electron desktop app (renderer in `src/`, main process in `electron/`, tests in `scripts/*.test.ts`).
- `apps/landing`: public marketing/legal website (Vite + React, deployed with `deploy.sh` behind Caddy).
- `apps/license-api`: licensing API (Cloudflare Worker).
- `packages/core`, `packages/ui`, `packages/theme`, `packages/config`: shared internal packages.
- `docs`: public VitePress documentation.

## Working Rules

- Inspect the current code before proposing architecture or making broad edits.
- Keep changes small, production-minded, and aligned with existing patterns.
- Never commit or expose secrets, keys, credentials, certificates, customer data, or local `.env` values.
- Do not run deploy, upload, notarization, publishing, or release scripts unless explicitly asked.
- Do not revert unrelated local changes.
- For frontend work, verify layout and keep localized UI free of hard-coded English fallback text.

## Verification

- Desktop version source of truth: `apps/desktop/package.json` and root `package-lock.json`.
- Desktop changelog: `apps/desktop/CHANGELOG_NEXT.md`.
- Default desktop checks:
  - `volta run --node 22.22.0 npm run build:vite --workspace=ownshell-desktop`
  - `volta run --node 22.22.0 npm test --workspace=ownshell-desktop` (runs every `apps/desktop/scripts/*.test.ts`)
  - `git diff --check`
- If `apps/landing` changes, also run `volta run --node 22.22.0 npm run build --workspace=landing`.

## Product Boundaries

- OwnShell is a local-first desktop DevOps workspace: SSH, SFTP, S3, Docker, databases, vault/env management, API client, licensing, and updates.
- Team Vaults / self-hosted encrypted sync is a roadmap item, not a shipped feature. Do not describe it as available.
- Personal mode must remain local-first, private, and usable without an account.
- OwnShell sends no automatic crash or diagnostics reports.

## Agent Context

- Release prep: `.agents/skills/release-ready-commit/SKILL.md`.
- Packaged macOS verification: `.agents/skills/ownshell-packaged-app-audit/SKILL.md`.
- Issues live in GitHub Issues for `SchildW3rk/OwnShell`; read `.agents/issue-tracker.md` before ticket operations and `.agents/triage-labels.md` before changing labels.
