# Backup & restore

Backups are in **Settings → Data & Storage**. A backup is a single encrypted file you can store anywhere, for example to move OwnShell to a new Mac.

## What is included

- SSH hosts with their credentials, SSH keys (private keys and passphrases)
- Tunnels and snippets
- S3 connections and database connections
- Vault credentials and environments
- Projects
- API collections, requests and global API variables
- Sidebar folders

**Not included**: app settings, your master password and your license (enter the key again on a new Mac).

## Export

1. Unlock OwnShell and open **Settings → Data & Storage**.
2. Enter a **backup password** (at least 4 characters). It is separate from your master password.
3. Export. The default file name is `ownshell-backup-YYYY-MM-DD.ownshell-vault`.

Secrets are decrypted with your master key and re-encrypted with the backup password. The file is compressed and encrypted with AES-256-GCM, with a key derived from the backup password via scrypt.

::: tip
Use a strong backup password: anyone with the file and the password can read all your credentials.
:::

## Import

1. Open **Settings → Data & Storage** and choose the backup file.
2. Enter the backup password.

::: danger Import replaces your data
An import **replaces** the matching data in OwnShell; it does not merge. It runs in a single transaction: if anything fails, nothing is changed. Data types that the backup does not contain (from older versions) stay untouched. Backups made by a newer OwnShell version are rejected.
:::
