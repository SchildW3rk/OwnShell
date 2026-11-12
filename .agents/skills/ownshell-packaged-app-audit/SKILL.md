---
name: ownshell-packaged-app-audit
description: Audit the shipped OwnShell macOS desktop app after a rebuild or install. Use when the task is to verify what actually landed in `/Applications/OwnShell.app`, compare it against recent Electron hardening work, or distinguish local package checks from the signed installed bundle.
argument-hint: "[app-path]"
disable-model-invocation: false
user-invocable: false
allowed-tools:
  - Read
  - Grep
  - Bash
---

# OwnShell Packaged App Audit

## When to use

Use this when:
1. The target is the shipped macOS app, usually `/Applications/OwnShell.app`.
2. The user has rebuilt or reinstalled OwnShell and wants to know whether fixes actually shipped.
3. The work involves Electron packaging hardening, ATS, entitlements, CSP, IPC exposure, or bundle hygiene.

Do not use this for:
1. Source-only Electron reviews with no packaged artifact to inspect.
2. Generic Electron apps that are not the OwnShell desktop repo layout.

## Inputs / context to gather

1. Resolve the app path from `$ARGUMENTS`; default to `/Applications/OwnShell.app`.
2. Confirm the repo root is the OwnShell checkout and note:
   - `apps/desktop/electron/main.ts`
   - `apps/desktop/electron/ipc/safe-ipc.ts`
   - `apps/desktop/electron/ipc/database/settings.ts`
   - `apps/desktop/electron/security/content-security-policy.ts`
   - `apps/desktop/electron-builder.json`
   - `apps/desktop/scripts/after-pack.cjs`
3. If the installed app is missing, fall back to the local packaged artifact under `apps/desktop/release/mac-arm64/OwnShell.app`, but mark that as a structure-only check.

## Procedure

1. Read bundle identity and trust status.
   - Check `Contents/Info.plist` for version and bundle id.
   - Run `codesign -dv --verbose=4 "$APP_PATH"` and `spctl --assess --type execute -vv "$APP_PATH"`.
2. Anchor on the active packaged chain.
   - Open `Contents/Resources/app.asar`.
   - Inspect `dist-electron/main.js` to find the active hashed main chunk.
   - Inspect that hashed main chunk, `dist-electron/preload.js`, and the active `dist/assets/index-*.js`.
3. Check the shipped hardening surfaces.
   - Verify packaged-vs-dev gating is behind `!app.isPackaged`.
   - Verify BrowserWindow sandboxing, CSP behavior, and IPC sender validation.
   - Verify renderer settings access is allowlisted.
4. Check bundle hygiene.
   - Measure `app.asar` and `app.asar.unpacked`.
   - Count stale `.map`, `src`, test, or script payloads.
   - Confirm only one active main chunk and one active renderer chunk are effectively in use.
5. Check macOS packaging hardening.
   - Inspect ATS and notarization state.
   - Inspect Electron fuses on `Contents/MacOS/OwnShell`.
6. Compare findings against the current repo sources only after the installed bundle has been characterized.

## Efficiency plan

1. Start with `Info.plist`, `codesign`, `spctl`, and the active main stub before reading broader repo code.
2. Follow the active hashed chunk instead of reviewing every stale artifact in the ASAR.
3. Read only the OwnShell files that map directly to the installed behavior under test.
4. Stop early if the task only needs structure checks and there is no installed app; label the result as incomplete release verification.

## Pitfalls and fixes

- Symptom: source looks fixed but the installed app still behaves insecurely.
  - Likely cause: the shipped app bundle lagged the checkout or the release build.
  - Fix: inspect `/Applications/OwnShell.app` directly and report shipped-vs-source differences.

- Symptom: `NSAllowsArbitraryLoads=true` keeps showing up after builder config changes.
  - Likely cause: `extendInfo` did not override the generated plist.
  - Fix: verify `apps/desktop/scripts/after-pack.cjs` and re-check the packaged `Info.plist`.

- Symptom: ASAR integrity looks configured but release hardening is still incomplete.
  - Likely cause: `ElectronAsarIntegrity` was checked without verifying the Electron fuse state.
  - Fix: inspect the installed binary fuses and treat loose fuse values as a remaining hardening gap.

- Symptom: local package checks look clean but release confidence is still weak.
  - Likely cause: only the unsigned `--dir` package was inspected.
  - Fix: treat the signed and installed `/Applications/OwnShell.app` as the acceptance gate.

## Verification checklist

1. Version, bundle id, signing, and Gatekeeper status were checked on the target app.
2. The active packaged chain was identified from `dist-electron/main.js`.
3. Sandbox, CSP, IPC sender validation, settings allowlist, and packaged dev gating were checked in shipped code.
4. ATS and Electron fuse state were verified, not inferred.
5. The result clearly distinguishes installed-app verification from local `release/mac-arm64` structure checks.
