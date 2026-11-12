# Local macOS Release to R2

OwnShell desktop releases are built locally on macOS and published to Cloudflare R2.
GitHub Actions are not used for desktop builds, updater metadata, or landing deploys.

## Requirements

- macOS with Apple Developer ID Application certificate available to `electron-builder`
  through the login keychain, `CSC_NAME`, or `CSC_LINK`/`CSC_KEY_PASSWORD`.
- Apple notarization credentials in the environment or keychain. Supported options:
  `APPLE_API_KEY`/`APPLE_API_KEY_ID`/`APPLE_API_ISSUER`,
  `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID`, or
  `APPLE_KEYCHAIN`/`APPLE_KEYCHAIN_PROFILE`.
- `npm`
- `jq`
- `rclone` with an `r2:` remote configured for the Cloudflare R2 account

Default target:

- Bucket: `<your-r2-bucket>` (set `R2_BUCKET`)
- Public URL: `https://release.ownshell.app`
- Build target: `arm64`

Override when needed:

```bash
R2_REMOTE=r2 R2_BUCKET=<your-r2-bucket> R2_PUBLIC_URL=https://release.example.com npm run release:desktop
```

## Release Flow

1. Bump `apps/desktop/package.json` version.
2. Update `apps/desktop/CHANGELOG_NEXT.md`.
3. Verify locally:

```bash
npm run build:vite --workspace=ownshell-desktop
npm run test:security --workspace=ownshell-desktop
```

4. Build and publish:

```bash
npm run release:desktop
```

The script validates Apple notarization credentials before building, so expired or
incorrect app-specific passwords fail early instead of after packaging.
It also checks that a Developer ID Application certificate is available before
building and refuses to prepare or upload artifacts unless the produced app
passes Developer ID signing, hardened runtime, Gatekeeper, stapled notarization,
entitlement, Electron fuse, and ASAR hygiene checks.

Releases are Apple Silicon-only right now. This keeps local builds fast and avoids
macOS killing the much heavier combined arm64+x64 packaging process under memory
pressure. If `BUILD_TARGET=universal` is still exported in your shell, unset it
before running the release:

```bash
unset BUILD_TARGET
```

For non-interactive upload:

```bash
UPLOAD=yes npm run release:desktop
```

If a dry run already produced valid artifacts, `UPLOAD=yes` automatically reuses
them instead of rebuilding. To force upload of existing artifacts explicitly:

```bash
SKIP_BUILD=yes UPLOAD=yes npm run release:desktop
```

To force a rebuild while uploading:

```bash
SKIP_BUILD=no UPLOAD=yes npm run release:desktop
```

To verify existing local release artifacts without uploading:

```bash
npm run release:verify --workspace=ownshell-desktop
```

If the unpacked `release/mac-arm64/OwnShell.app` is missing, the verification
script extracts the app from `OwnShell-<version>-arm64-mac.zip` and verifies
that copy.

## R2 Layout

The script uploads versioned binaries to:

```text
/v<version>/OwnShell-<version>-arm64.dmg
/v<version>/OwnShell-<version>-arm64-mac.zip
/v<version>/*.blockmap
```

The script updates root metadata:

```text
/latest-mac.yml
/releases.json
```

`latest-mac.yml` is the source of truth for `electron-updater`.
`releases.json` is used by the landing page and in-app changelog. The landing
page reads it at runtime through `https://ownshell.app/releases.json`, which is
proxied to `https://release.ownshell.app/releases.json`, so a new desktop
release does not require a landing redeploy just to update the displayed version
or download URL.

## Landing Deploy

Deploy the landing page only when the landing app, legal pages, SEO metadata or
download-button behavior changed:

```bash
apps/landing/deploy.sh
```

This builds `apps/landing`, syncs `apps/landing/dist` to the production server,
and updates the central Caddy route for `ownshell.app`.

## Update Smoke Test

1. Install the previous release, for example `1.21.0`.
2. Publish a newer version, for example `1.21.1`.
3. Start the installed app.
4. Confirm the update banner or Settings update state changes from `checking` to `available`.
5. Download the update and verify it reaches `ready`.
6. Install and confirm the app restarts into the new version.
