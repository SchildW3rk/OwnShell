#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DESKTOP_DIR="$(dirname "$SCRIPT_DIR")"
VERSION="$(node -p "require('$DESKTOP_DIR/package.json').version")"
RELEASE_DIR="$DESKTOP_DIR/release"
APP_BUNDLE="${1:-$RELEASE_DIR/mac-arm64/OwnShell.app}"
DMG_PATH="${DMG_PATH:-$RELEASE_DIR/OwnShell-${VERSION}-arm64.dmg}"
ZIP_PATH="${ZIP_PATH:-$RELEASE_DIR/OwnShell-${VERSION}-arm64-mac.zip}"
LATEST_MAC_YML="${LATEST_MAC_YML:-$RELEASE_DIR/latest-mac.yml}"
REQUIRE_RELEASE_ARTIFACTS="${REQUIRE_RELEASE_ARTIFACTS:-no}"

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
  [ -f "$1" ] || fail "Missing required file: $1"
}

require_dir() {
  [ -d "$1" ] || fail "Missing required directory: $1"
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  local message="$3"

  if ! grep -Fq "$needle" <<<"$haystack"; then
    fail "$message"
  fi
}

assert_not_contains() {
  local haystack="$1"
  local needle="$2"
  local message="$3"

  if grep -Fq "$needle" <<<"$haystack"; then
    fail "$message"
  fi
}

plist_bool() {
  local plist_file="$1"
  local key_path="$2"

  /usr/libexec/PlistBuddy -c "Print ${key_path}" "$plist_file" 2>/dev/null
}

assert_plist_bool() {
  local plist_file="$1"
  local key_path="$2"
  local expected="$3"
  local actual

  actual="$(plist_bool "$plist_file" "$key_path" || true)"
  if [ "$actual" != "$expected" ]; then
    fail "$plist_file ${key_path} is '${actual:-missing}', expected '$expected'"
  fi
}

if [ "$(uname -s)" != "Darwin" ]; then
  fail "macOS release verification must run on macOS"
fi

require_command codesign
require_command spctl
require_command xcrun
require_command npx
require_command node
require_command unzip

ENTITLEMENTS_FILE=""
ASAR_LIST_FILE=""
ZIP_LIST_FILE=""
EXTRACT_DIR=""

cleanup() {
  rm -f "$ENTITLEMENTS_FILE" "$ASAR_LIST_FILE" "$ZIP_LIST_FILE"
  if [ -n "$EXTRACT_DIR" ]; then
    rm -rf "$EXTRACT_DIR"
  fi
}
trap cleanup EXIT

if [ ! -d "$APP_BUNDLE" ] && [ -f "$ZIP_PATH" ]; then
  log "Extracting OwnShell.app from updater ZIP for verification"
  EXTRACT_DIR="$(mktemp -d)"
  unzip -q "$ZIP_PATH" -d "$EXTRACT_DIR"
  APP_BUNDLE="$EXTRACT_DIR/OwnShell.app"
fi

if [ "$REQUIRE_RELEASE_ARTIFACTS" = "yes" ]; then
  require_file "$LATEST_MAC_YML"
  require_file "$DMG_PATH"
  require_file "$ZIP_PATH"
fi

require_dir "$APP_BUNDLE"
require_file "$APP_BUNDLE/Contents/Info.plist"
require_file "$APP_BUNDLE/Contents/Resources/app.asar"

log "Verifying app code signature"
codesign --verify --deep --strict --verbose=2 "$APP_BUNDLE"

SIGNATURE_DETAILS="$(codesign -dv --verbose=4 "$APP_BUNDLE" 2>&1)"
assert_contains "$SIGNATURE_DETAILS" "Identifier=com.ownshell.app" \
  "OwnShell.app is not signed with the expected bundle identifier"
assert_contains "$SIGNATURE_DETAILS" "Authority=Developer ID Application:" \
  "OwnShell.app is not signed with a Developer ID Application certificate"
assert_contains "$SIGNATURE_DETAILS" "TeamIdentifier=" \
  "OwnShell.app signature has no Apple TeamIdentifier"
assert_contains "$SIGNATURE_DETAILS" "runtime" \
  "OwnShell.app is not signed with hardened runtime"
assert_not_contains "$SIGNATURE_DETAILS" "Signature=adhoc" \
  "OwnShell.app is ad-hoc signed; install a Developer ID Application certificate before release"
assert_not_contains "$SIGNATURE_DETAILS" "TeamIdentifier=not set" \
  "OwnShell.app signature has no Apple team identifier"

log "Verifying Gatekeeper acceptance"
spctl --assess --type execute -vv "$APP_BUNDLE"

log "Verifying notarization ticket"
xcrun stapler validate "$APP_BUNDLE"

log "Verifying signing entitlements"
ENTITLEMENTS_FILE="$(mktemp)"
codesign -d --entitlements :- "$APP_BUNDLE" >"$ENTITLEMENTS_FILE" 2>/dev/null
if [ ! -s "$ENTITLEMENTS_FILE" ]; then
  fail "OwnShell.app has no signed entitlements"
fi

assert_plist_bool "$ENTITLEMENTS_FILE" ":com.apple.security.cs.allow-jit" "true"
assert_plist_bool "$ENTITLEMENTS_FILE" ":com.apple.security.network.client" "true"
assert_plist_bool "$ENTITLEMENTS_FILE" ":com.apple.security.files.user-selected.read-write" "true"

ENTITLEMENTS="$(cat "$ENTITLEMENTS_FILE")"
assert_not_contains "$ENTITLEMENTS" "com.apple.security.cs.disable-library-validation" \
  "Release entitlement disables library validation"
assert_not_contains "$ENTITLEMENTS" "com.apple.security.cs.allow-dyld-environment-variables" \
  "Release entitlement allows DYLD environment variables"
assert_not_contains "$ENTITLEMENTS" "com.apple.security.cs.allow-unsigned-executable-memory" \
  "Release entitlement allows unsigned executable memory"
assert_not_contains "$ENTITLEMENTS" "com.apple.security.cs.disable-executable-page-protection" \
  "Release entitlement disables executable page protection"

log "Verifying Info.plist hardening"
INFO_PLIST="$APP_BUNDLE/Contents/Info.plist"
assert_plist_bool "$INFO_PLIST" ":NSAppTransportSecurity:NSAllowsArbitraryLoads" "false"
assert_plist_bool "$INFO_PLIST" ":NSAppTransportSecurity:NSAllowsLocalNetworking" "true"

ASAR_HASH="$(/usr/libexec/PlistBuddy -c 'Print :ElectronAsarIntegrity:Resources/app.asar:hash' "$INFO_PLIST" 2>/dev/null || true)"
if [ -z "$ASAR_HASH" ]; then
  fail "ElectronAsarIntegrity hash for Resources/app.asar is missing"
fi

log "Verifying Electron fuses"
FUSE_OUTPUT="$(npx @electron/fuses read --app "$APP_BUNDLE" 2>&1)"
assert_contains "$FUSE_OUTPUT" "RunAsNode is Disabled" "Electron RunAsNode fuse is not disabled"
assert_contains "$FUSE_OUTPUT" "EnableNodeOptionsEnvironmentVariable is Disabled" \
  "Electron NODE_OPTIONS fuse is not disabled"
assert_contains "$FUSE_OUTPUT" "EnableNodeCliInspectArguments is Disabled" \
  "Electron inspect-arguments fuse is not disabled"
assert_contains "$FUSE_OUTPUT" "EnableEmbeddedAsarIntegrityValidation is Enabled" \
  "Electron ASAR integrity fuse is not enabled"
assert_contains "$FUSE_OUTPUT" "OnlyLoadAppFromAsar is Enabled" \
  "Electron OnlyLoadAppFromAsar fuse is not enabled"
assert_contains "$FUSE_OUTPUT" "GrantFileProtocolExtraPrivileges is Disabled" \
  "Electron file-protocol privileges fuse is not disabled"

log "Verifying ASAR release hygiene"
ASAR_LIST_FILE="$(mktemp)"
npx asar list "$APP_BUNDLE/Contents/Resources/app.asar" >"$ASAR_LIST_FILE"

if grep -Eq '\.map$|^/src/|^/electron/|^/scripts/|(^|/)(__tests__|test|tests)/' "$ASAR_LIST_FILE"; then
  grep -E '\.map$|^/src/|^/electron/|^/scripts/|(^|/)(__tests__|test|tests)/' "$ASAR_LIST_FILE" | head -20 >&2
  fail "ASAR contains source maps, source trees, scripts, or tests"
fi

if [ -f "$ZIP_PATH" ]; then
  log "Verifying updater ZIP contains OwnShell.app"
  ZIP_LIST_FILE="$(mktemp)"
  unzip -Z1 "$ZIP_PATH" >"$ZIP_LIST_FILE"
  if ! grep -qx "OwnShell.app/Contents/Info.plist" "$ZIP_LIST_FILE"; then
    fail "Updater ZIP does not contain OwnShell.app/Contents/Info.plist"
  fi
fi

log "macOS release signature verification passed"
