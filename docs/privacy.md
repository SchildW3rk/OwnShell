# Privacy & network

OwnShell is local-first. It needs **no account**, has **no telemetry, analytics or crash reporting**, and does not sync workspace data to any cloud.

## Where your data lives

Everything is stored on your Mac in OwnShell's data folder under `~/Library/Application Support/`:

- `ownshell.db`: a local SQLite database with hosts, connections, vault, projects, API collections and settings. Secrets inside it are encrypted with your master password (AES-256-GCM).
- `logs/ownshell.log`: a local log (max. 10 MB). Passwords, keys and terminal output are filtered out. Logs are never sent anywhere.

## Connections OwnShell makes on its own

| What | Where | When |
| --- | --- | --- |
| Update check | `release.ownshell.app` | 5 seconds after start, then every 30 minutes. Automatic download is optional (off by default); the check itself cannot be turned off. |
| Release notes | `release.ownshell.app/releases.json` | Only when the *What's new* window opens, e.g. after an update. |
| License | `license.ownshell.app` | Only if you enter a license key: on activation, on deactivation, and to refresh the signed license when it is about to expire. |

License activation sends the license key, a hashed device ID (SHA-256 of the Mac's hardware UUID; the raw ID is never sent), the app version and the platform.

The app's user interface itself cannot contact any outside server.

## Connections you start

Everything else is initiated by you and goes **directly from your Mac** to your own infrastructure: SSH, SFTP, S3 endpoints, databases, Docker over SSH, API client requests (directly or through one of your SSH hosts) and OAuth logins in your browser.

## Support

There is no automatic error reporting. If something goes wrong, write to support@ownshell.app and attach only what you choose to share.
