# Install & first launch

OwnShell is a desktop app for macOS on **Apple Silicon** (M1 or newer). There are no Windows or Linux builds.

## Install

1. Download the latest `.dmg` from [ownshell.app](https://ownshell.app/).
2. Open the `.dmg` and drag **OwnShell** into **Applications**.
3. Start OwnShell from Applications or Launchpad.

Release builds are signed and notarized by Apple, so macOS opens them without extra steps.

## Create your master password

On first launch OwnShell asks for a **master password**. It encrypts the secrets OwnShell stores: host passwords, SSH keys, database and S3 credentials, vault entries, API-client variables marked as secret, tokens, passwords, API keys and OAuth client secrets in a request's **Auth** fields, OAuth tokens and cookies.

The password needs at least 8 characters with one uppercase letter, one lowercase letter and one digit.

### Save your recovery key

Next, OwnShell shows a **recovery key** once, in the form `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`. Copy it into a password manager, tick **I have saved my recovery key in a safe place** and continue.

::: warning There is no other way back in
If you forget the master password, the recovery key is the only way to set a new one. Without it, nobody (including us) can unlock your data.

A reset with the recovery key keeps your hosts and connection settings but **deletes all stored secrets**: passwords, private keys, passphrases, API tokens and cookies. You then enter them again.
:::

There is currently no "change master password" function. To use a new password, keep a [backup](/advanced/backup-restore) and reset via the recovery key.

### How your data is protected

- The key is derived from your master password with PBKDF2-HMAC-SHA256 (100,000 iterations, random salt).
- Secrets are encrypted with **AES-256-GCM** before they are written to the local database.
- The key lives only in memory while OwnShell is unlocked and is wiped when it locks.

## Lock and auto-lock

- Click **Lock** in the header to lock OwnShell at any time.
- OwnShell locks itself after a period without keyboard or mouse activity. The default is **5 minutes**; change it (1–60 minutes) under **Settings → General → Security → Auto-Lock Timeout**.
- OwnShell always locks when your Mac goes to sleep or the screen locks.

After every restart you unlock with your master password.

## Updates

OwnShell checks for updates shortly after start and every 30 minutes. Under **Settings → General → Updates** you choose whether updates are downloaded automatically (off by default). A downloaded update installs when you quit, or right away with **Install now**.

## Next steps

- [Connect to your first server](/features/ssh)
- [Browse files with SFTP](/features/files)
- [Store secrets in the vault](/features/vault)
- [Send your first API request](/features/api-client)
