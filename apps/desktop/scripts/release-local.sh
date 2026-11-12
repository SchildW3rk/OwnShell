#!/bin/bash
set -euo pipefail

# OwnShell local macOS release.
# Builds on this Mac, uploads artifacts to Cloudflare R2, and updates the
# generic electron-updater metadata at the R2 bucket root.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DESKTOP_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$(dirname "$DESKTOP_DIR")")"

RELEASE_ENV_FILE="${RELEASE_ENV_FILE:-$DESKTOP_DIR/.env.release.local}"
if [ -f "$RELEASE_ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$RELEASE_ENV_FILE"
  set +a
fi

R2_REMOTE="${R2_REMOTE:-r2}"
R2_BUCKET="${R2_BUCKET:?Set R2_BUCKET in .env.release.local}"
R2_PUBLIC_URL="${R2_PUBLIC_URL:-https://release.ownshell.app}"
BUILD_TARGET="${BUILD_TARGET:-arm64}"
UPLOAD="${UPLOAD:-ask}"
SKIP_BUILD="${SKIP_BUILD:-auto}"

cd "$DESKTOP_DIR"

VERSION="$(node -p "require('./package.json').version")"
RELEASE_DIR="$DESKTOP_DIR/release"
UPLOAD_META_DIR="$RELEASE_DIR/upload-metadata"

log() {
  printf '\n==> %s\n' "$1"
}

fail() {
  printf '\nERROR: %s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

require_file() {
  [ -f "$1" ] || fail "Missing required release artifact: $1"
}

latest_mac_version() {
  [ -f "$RELEASE_DIR/latest-mac.yml" ] || return 1
  sed -n -E "s/^version:[[:space:]]*['\"]?([^'\"]+)['\"]?$/\1/p" "$RELEASE_DIR/latest-mac.yml" | head -n 1
}

assert_latest_mac_version() {
  local metadata_version
  metadata_version="$(latest_mac_version || true)"

  if [ -z "$metadata_version" ]; then
    fail "Could not read release version from $RELEASE_DIR/latest-mac.yml"
  fi

  if [ "$metadata_version" != "$VERSION" ]; then
    fail "Built updater metadata version is ${metadata_version}, expected ${VERSION}. Re-run with SKIP_BUILD=no so all artifacts are rebuilt from one version."
  fi
}

if [ "$(uname -s)" != "Darwin" ]; then
  fail "macOS releases must be built on macOS"
fi

require_command node
require_command npm
require_command jq
require_command rclone

if ! rclone listremotes 2>/dev/null | grep -qx "${R2_REMOTE}:"; then
  fail "rclone remote '${R2_REMOTE}:' is not configured"
fi

if [ "$BUILD_TARGET" != "arm64" ]; then
  fail "Local R2 releases are arm64-only right now. Run 'unset BUILD_TARGET' and try again."
fi

case "$SKIP_BUILD" in
  auto | yes | no) ;;
  *) fail "SKIP_BUILD must be 'auto', 'yes', or 'no'" ;;
esac

artifact_set_exists() {
  [ -f "$RELEASE_DIR/latest-mac.yml" ] &&
    [ -f "$RELEASE_DIR/OwnShell-${VERSION}-arm64.dmg" ] &&
    [ -f "$RELEASE_DIR/OwnShell-${VERSION}-arm64.dmg.blockmap" ] &&
    [ -f "$RELEASE_DIR/OwnShell-${VERSION}-arm64-mac.zip" ] &&
    [ -f "$RELEASE_DIR/OwnShell-${VERSION}-arm64-mac.zip.blockmap" ]
}

if [ "$SKIP_BUILD" = "auto" ]; then
  if [ "$UPLOAD" = "yes" ] && artifact_set_exists; then
    SKIP_BUILD="yes"
  else
    SKIP_BUILD="no"
  fi
fi

run_notary_preflight() {
  local label="$1"
  shift
  local output

  if output="$("$@" 2>&1)"; then
    log "Apple notarization credentials OK (${label})"
    return 0
  fi

  printf '\nApple notarization credential check failed (%s):\n%s\n' "$label" "$output" >&2
  fail "Fix Apple notarization credentials before running the release build"
}

preflight_notarization() {
  if [ "${SKIP_NOTARY_PREFLIGHT:-no}" = "yes" ]; then
    log "Skipping Apple notarization credential preflight"
    return 0
  fi

  if [ -n "${APPLE_API_KEY:-}" ] || [ -n "${APPLE_API_KEY_ID:-}" ] || [ -n "${APPLE_API_ISSUER:-}" ]; then
    if [ -z "${APPLE_API_KEY:-}" ] || [ -z "${APPLE_API_KEY_ID:-}" ] || [ -z "${APPLE_API_ISSUER:-}" ]; then
      fail "Set APPLE_API_KEY, APPLE_API_KEY_ID, and APPLE_API_ISSUER for App Store Connect API key notarization"
    fi

    run_notary_preflight "App Store Connect API key" \
      xcrun notarytool history \
      --key "$APPLE_API_KEY" \
      --key-id "$APPLE_API_KEY_ID" \
      --issuer "$APPLE_API_ISSUER"
    return 0
  fi

  if [ -n "${APPLE_ID:-}" ] || [ -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" ] || [ -n "${APPLE_TEAM_ID:-}" ]; then
    if [ -z "${APPLE_ID:-}" ] || [ -z "${APPLE_APP_SPECIFIC_PASSWORD:-}" ] || [ -z "${APPLE_TEAM_ID:-}" ]; then
      fail "Set APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID for Apple ID notarization"
    fi

    run_notary_preflight "Apple ID app-specific password" \
      xcrun notarytool history \
      --apple-id "$APPLE_ID" \
      --password "$APPLE_APP_SPECIFIC_PASSWORD" \
      --team-id "$APPLE_TEAM_ID"
    return 0
  fi

  if [ -n "${APPLE_KEYCHAIN:-}" ] || [ -n "${APPLE_KEYCHAIN_PROFILE:-}" ]; then
    if [ -z "${APPLE_KEYCHAIN:-}" ] || [ -z "${APPLE_KEYCHAIN_PROFILE:-}" ]; then
      fail "Set APPLE_KEYCHAIN and APPLE_KEYCHAIN_PROFILE for keychain notarization"
    fi

    run_notary_preflight "keychain profile" \
      xcrun notarytool history \
      --keychain "$APPLE_KEYCHAIN" \
      --keychain-profile "$APPLE_KEYCHAIN_PROFILE"
    return 0
  fi

  fail "Missing Apple notarization credentials. Set APPLE_API_KEY/APPLE_API_KEY_ID/APPLE_API_ISSUER, APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID, or APPLE_KEYCHAIN/APPLE_KEYCHAIN_PROFILE"
}

preflight_code_signing() {
  if [ "${SKIP_CODESIGN_PREFLIGHT:-no}" = "yes" ]; then
    log "Skipping Developer ID code-signing preflight"
    return 0
  fi

  if [ -n "${CSC_LINK:-}" ]; then
    if [ -z "${CSC_KEY_PASSWORD:-}" ]; then
      fail "Set CSC_KEY_PASSWORD when CSC_LINK is used for code signing"
    fi

    log "Developer ID code-signing preflight OK (CSC_LINK)"
    return 0
  fi

  if [ "${CSC_IDENTITY_AUTO_DISCOVERY:-true}" = "false" ] && [ -z "${CSC_NAME:-}" ]; then
    fail "CSC_IDENTITY_AUTO_DISCOVERY=false requires CSC_NAME or CSC_LINK for release signing"
  fi

  local identities
  identities="$(security find-identity -v -p codesigning 2>/dev/null || true)"

  if [ -n "${CSC_NAME:-}" ]; then
    if grep -Fq "$CSC_NAME" <<<"$identities"; then
      log "Developer ID code-signing preflight OK (${CSC_NAME})"
      return 0
    fi

    fail "Configured CSC_NAME '${CSC_NAME}' was not found in the available code-signing identities"
  fi

  if grep -Eq 'Developer ID Application: .+ \([A-Z0-9]+\)' <<<"$identities"; then
    log "Developer ID code-signing preflight OK"
    return 0
  fi

  fail "No Developer ID Application certificate found in the keychain"
}

preflight_r2_upload() {
  local output

  if [ "$UPLOAD" != "yes" ]; then
    return 0
  fi

  log "Checking R2 bucket access"
  if output="$(rclone lsf "${R2_REMOTE}:${R2_BUCKET}" --s3-no-check-bucket --max-depth 1 2>&1 >/dev/null)"; then
    return 0
  fi

  printf '\nR2 bucket access check failed:\n%s\n' "$output" >&2
  fail "Fix rclone remote '${R2_REMOTE}:' credentials or endpoint before uploading"
}

if [ "$SKIP_BUILD" = "no" ]; then
  require_command xcrun
  require_command security
  preflight_code_signing
  preflight_notarization
fi
preflight_r2_upload

cat <<EOF

==========================================
  OwnShell local macOS release v${VERSION}
==========================================

R2 remote:     ${R2_REMOTE}:
R2 bucket:     ${R2_BUCKET}
Public URL:    ${R2_PUBLIC_URL}
Build target:  ${BUILD_TARGET}
Skip build:    ${SKIP_BUILD}

EOF

log "Preparing release directory"
rm -rf "$UPLOAD_META_DIR"
mkdir -p "$RELEASE_DIR" "$UPLOAD_META_DIR"

if [ "$SKIP_BUILD" = "yes" ]; then
  log "Reusing existing release artifacts"
  if ! artifact_set_exists; then
    fail "Existing release artifacts are incomplete. Run 'SKIP_BUILD=no UPLOAD=no npm run release:local --workspace=ownshell-desktop' first."
  fi
else
  log "Cleaning release artifacts"
  rm -f "$RELEASE_DIR"/*.dmg \
        "$RELEASE_DIR"/*.zip \
        "$RELEASE_DIR"/*.blockmap \
        "$RELEASE_DIR"/*.yml \
        "$RELEASE_DIR"/releases.json
  rm -rf "$RELEASE_DIR"/mac \
         "$RELEASE_DIR"/mac-arm64 \
         "$RELEASE_DIR"/*-unpacked

  log "Building shared packages"
  cd "$ROOT_DIR"
  npm run build --workspace=packages/core --workspace=packages/ui

  log "Building desktop app"
  cd "$DESKTOP_DIR"
  npm run build:vite

  log "Building macOS arm64 DMG"
  npx electron-builder --mac dmg --arm64 --config electron-builder.json -c.extraMetadata.version="$VERSION"

  log "Building macOS arm64 updater ZIP"
  npx electron-builder --mac zip --arm64 --config electron-builder.json -c.extraMetadata.version="$VERSION"
fi

log "Validating release artifacts"
require_file "$RELEASE_DIR/latest-mac.yml"
assert_latest_mac_version
require_file "$RELEASE_DIR/OwnShell-${VERSION}-arm64.dmg"
require_file "$RELEASE_DIR/OwnShell-${VERSION}-arm64.dmg.blockmap"
require_file "$RELEASE_DIR/OwnShell-${VERSION}-arm64-mac.zip"
require_file "$RELEASE_DIR/OwnShell-${VERSION}-arm64-mac.zip.blockmap"

log "Verifying macOS code signature and notarization"
REQUIRE_RELEASE_ARTIFACTS=yes bash "$SCRIPT_DIR/verify-macos-release.sh" "$RELEASE_DIR/mac-arm64/OwnShell.app"

ls -lh "$RELEASE_DIR"/*.dmg "$RELEASE_DIR"/*.zip

log "Preparing updater metadata"
cp "$RELEASE_DIR/latest-mac.yml" "$UPLOAD_META_DIR/latest-mac.yml"
sed -i '' "s|url: OwnShell|url: v${VERSION}/OwnShell|g" "$UPLOAD_META_DIR/latest-mac.yml"
sed -i '' "s|^path: |path: v${VERSION}/|g" "$UPLOAD_META_DIR/latest-mac.yml"

if [ -f "$DESKTOP_DIR/CHANGELOG_NEXT.md" ]; then
  CHANGELOG="$(cat "$DESKTOP_DIR/CHANGELOG_NEXT.md")"
else
  CHANGELOG="## Changes in v${VERSION}

- Bug fixes and improvements"
fi

jq -n \
  --arg version "$VERSION" \
  --arg releaseDate "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg changelog "$CHANGELOG" \
  --arg macArm64 "${R2_PUBLIC_URL}/v${VERSION}/OwnShell-${VERSION}-arm64.dmg" \
  '{
    version: $version,
    releaseDate: $releaseDate,
    changelog: $changelog,
    downloads: {
      "mac-arm64": $macArm64
    }
  }' > "$UPLOAD_META_DIR/releases.json"

if [ "$UPLOAD" = "ask" ]; then
  printf '\nUpload release to R2? [y/N]: '
  read -r UPLOAD_CONFIRM
  case "$UPLOAD_CONFIRM" in
    y | Y | yes | YES) UPLOAD="yes" ;;
    *) UPLOAD="no" ;;
  esac
fi

if [ "$UPLOAD" != "yes" ]; then
  cat <<EOF

Upload skipped.
Artifacts: $RELEASE_DIR
Prepared metadata: $UPLOAD_META_DIR

EOF
  exit 0
fi

log "Uploading versioned binaries to R2"
rclone copy "$RELEASE_DIR" "${R2_REMOTE}:${R2_BUCKET}/v${VERSION}/" \
  --include "*.dmg" \
  --include "*.zip" \
  --include "*.blockmap" \
  --max-depth 1 \
  --s3-no-check-bucket \
  --progress

log "Uploading updater metadata to R2 root"
rclone copyto "$UPLOAD_META_DIR/latest-mac.yml" "${R2_REMOTE}:${R2_BUCKET}/latest-mac.yml" --s3-no-check-bucket
rclone copyto "$UPLOAD_META_DIR/releases.json" "${R2_REMOTE}:${R2_BUCKET}/releases.json" --s3-no-check-bucket

log "Verifying public metadata"
curl -fsSL "${R2_PUBLIC_URL}/latest-mac.yml" | sed -n '1,20p'
curl -fsSL "${R2_PUBLIC_URL}/releases.json" | jq '.version, .downloads'

cat <<EOF

==========================================
  Release v${VERSION} uploaded
==========================================

Updater metadata:
  ${R2_PUBLIC_URL}/latest-mac.yml

Landing release data:
  ${R2_PUBLIC_URL}/releases.json

Downloads:
  Apple Silicon: ${R2_PUBLIC_URL}/v${VERSION}/OwnShell-${VERSION}-arm64.dmg
EOF
