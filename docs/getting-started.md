# Install & first launch

OwnShell is a desktop app for macOS on **Apple Silicon** (M1 or newer). There are no Windows or Linux builds.

## Install

1. Download the latest `.dmg` from [ownshell.app](https://ownshell.app/).
2. Open the `.dmg` and drag **OwnShell** into **Applications**.
3. Start OwnShell from Applications or Launchpad.

Release builds are signed and notarized by Apple, so macOS opens them without extra steps.

## Create your master password

On first launch OwnShell asks for a **master password**. It encrypts the secrets OwnShell stores: host passwords, SSH keys, database and S3 credentials, vault entries, API-client variables marked as secret, OAuth client secrets and tokens, cookies and your license key. Tokens, passwords and API keys typed directly into a request's **Auth** fields are stored as entered — put sensitive values into a secret variable and reference it as <code v-pre>{{name}}</code> instead.

The password needs at least 8 characters with one uppercase letter, one lowercase letter and one digit.

### Save your recovery key

Next, OwnShell shows a **recovery key** once, in the form `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`. Copy it into a password manager, tick **I have saved my recovery key in a safe place** and continue.

::: warning There is no other way back in
If you forget the master password, the recovery key is the only way to set a new one. Without it, nobody (including us) can unlock your data.

A reset with the recovery key keeps your hosts and connection settings but **deletes all stored secrets**: passwords, private keys, passphrases, API tokens, cookies and the license key. You then enter them again.
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

## Evaluation and license badge

OwnShell uses an **honor system**. No feature is ever locked.

- **Personal use is free**, with every feature and no account.
- **Commercial use** (work or revenue-generating activities) asks for an **Individual license: €79 per year incl. VAT**. See [pricing](https://ownshell.app/#pricing).

The badge in the header shows where you stand:

| Badge | Meaning |
| --- | --- |
| **Evaluation · N days** | The first 30 days after first launch. Runs locally, no account or payment details. |
| **Personal use** | The evaluation is over and no license is entered. Click it to confirm personal use (stored on this device only; undo under **Settings → License**), buy a license or enter a key. |
| **License does not cover this version** | Your license exists, but this build was released after your license's "updates until" date. |
| *(no badge)* | You confirmed personal use, or your license covers this build. |

### What happens when a license expires

A license covers **every version released before its "updates until" date, forever**. When it expires, nothing stops working. Newer versions show the notice above, and the updater does not install an update your license does not cover automatically. Renew to get newer versions, or keep using a covered one.

### Activate, move or deactivate a license

- Enter your key via the badge or **Settings → License**. Activation needs an internet connection; see [Privacy & network](/privacy) for what is sent.
- A license can be active on 3 devices. To move it, use **Settings → License → Deactivate this device** on the old Mac (needs a connection), then enter the key on the new one.

## Updates

OwnShell checks for updates shortly after start and every 30 minutes. Under **Settings → General → Updates** you choose whether updates are downloaded automatically (off by default). A downloaded update installs when you quit, or right away with **Install now**.

## Next steps

- [Connect to your first server](/features/ssh)
- [Browse files with SFTP](/features/files)
- [Store secrets in the vault](/features/vault)
- [Send your first API request](/features/api-client)
