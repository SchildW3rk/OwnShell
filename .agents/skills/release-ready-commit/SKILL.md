---
name: release-ready-commit
description: >-
  Finish a bugfix or feature implementation by preparing a release-ready commit:
  inspect git status, bump the appropriate app/package version, update
  changelog/release notes, run project checks, commit, and push when requested
  while leaving deployment/upload to the user. Use when the user says things like
  "version bumpen", "changelog schreiben", "alles commiten und pushen", "ich
  deploye dann", "mach ein update fertig", "prepare release", or after a
  bug/feature has been built and needs to be shipped.
argument-hint: "release scope, bump type, or target version"
---

# Release Ready Commit

Use this skill to close out implemented work so the maintainer can deploy or update manually.

Use `$ARGUMENTS` for a requested version, bump type, package/workspace, release scope, and whether to push.

## Workflow

1. Inspect the real repository state first:
   - `git status --short`
   - `git branch --show-current`
   - `git log --oneline --decorate --max-count=8`
   - relevant package/changelog/version files
2. Determine release scope:
   - use the exact version if the user gives one
   - otherwise use a patch bump for ordinary bugfixes and small features
   - use a minor bump only for clearly larger user-facing functionality
   - ask only if the changed app/package or semver impact is genuinely ambiguous
3. Protect unrelated work:
   - never revert user changes
   - keep unrelated dirty files unstaged
   - if the branch is already ahead, tell the user before pushing that the push will include existing local commits
4. Update version sources:
   - prefer the repo's package-manager command when it updates lockfiles correctly
   - keep all source-of-truth version files in sync
   - do not create git tags unless explicitly requested
5. Update changelog or release notes:
   - write user-facing bullets
   - mention fixed bugs, new features, migration/data impact, and security/privacy changes when relevant
   - avoid noisy implementation detail
6. Run verification after the version and changelog edits:
   - run the repo's relevant build, typecheck, lint, tests, or security checks
   - always run `git diff --check`
   - stop before committing if checks fail, unless the user explicitly accepts the risk
7. Stage only the coherent release set, commit with a clear message, and push when requested.
8. Stop before deploy, upload, notarization, publishing, or release scripts unless the user explicitly asks for that step.

## OwnShell Defaults

- Desktop version sources: `apps/desktop/package.json` and root `package-lock.json`.
- Desktop changelog: `apps/desktop/CHANGELOG_NEXT.md`.
- Desktop checks:
  - `volta run --node 22.22.0 npm run build:vite --workspace=ownshell-desktop`
  - `volta run --node 22.22.0 npm test --workspace=ownshell-desktop`
  - `git diff --check`
- Landing page check when landing files changed:
  - `volta run --node 22.22.0 npm run build --workspace=landing`
- Preferred desktop commit message shape:
  - `Prepare <version> <short release scope>`
  - example: `Prepare 1.22.34 sidebar organization`

## Critical Rules

1. Never deploy, upload, notarize, publish, or run release scripts unless the user explicitly asks.
2. Never use destructive git commands to clean the tree.
3. Never mark the release ready if version files, changelog, and lockfile are out of sync.
4. Never print, stage, or commit secrets, private certs, credentials, customer data, or production tokens.
5. Re-run verification after version/changelog changes, not only before.
6. In Codex desktop, after successful stage, commit, or push, include the required git directives in the final response.

## Final Response

Keep the final response short and include:

- prepared version
- commit hash and message, if committed
- pushed branch, if pushed
- verification commands and whether they passed
- any existing local commits included in the push
- clear note that deploy/update remains for the maintainer
