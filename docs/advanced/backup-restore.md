# Backup & Restore

Export your OwnShell data into a single encrypted file and restore it on the same or another machine.

## What Gets Backed Up?

- SSH hosts, including passwords and pinned host keys
- SSH keys (private keys and passphrases)
- Port forwarding tunnels
- Command snippets
- S3 connections, including access keys
- Sidebar folders
- Vault credentials (passwords)
- Vault environments, including all variable values
- Database connections, including passwords
- Projects
- API client collections and requests

**Not included:** your master password and recovery key, app settings and license data, query and transfer history, and local files such as SQLite database files or cached downloads.

## Creating a Backup

1. Unlock OwnShell.
2. Open **Settings** and choose **Export Backup**.
3. Enter a backup password. This password is separate from your master password.
4. Save the `.ownshell-vault` file.

::: tip
Store the backup password in a password manager. Without it the backup cannot be opened.
:::

## Restoring a Backup

1. Unlock OwnShell.
2. Open **Settings** and choose **Import Backup**.
3. Select the `.ownshell-vault` file and enter its backup password.

A restore **replaces** the backed-up data in this installation. It runs in a single database transaction: if anything fails, nothing is changed.

Backups made by older OwnShell versions only contain hosts, keys, tunnels, snippets, S3 connections and sidebar folders. Restoring such a file leaves vault data, database connections, projects and API client data untouched. Restoring replaces database connections, so their query history is removed.

## File Format

A `.ownshell-vault` file is binary:

| Bytes | Content |
| --- | --- |
| 8 | Magic `OWNVAULT` |
| 1 | Format version |
| 32 | scrypt salt |
| 16 | AES-GCM IV |
| 16 | AES-GCM authentication tag |
| rest | Encrypted, gzip-compressed JSON |

The key is derived from the backup password with scrypt (N=16384, r=8, p=1) and the data is encrypted with AES-256-GCM. Inside the file, secrets are stored in plain text, so the backup password is the only thing protecting them. On import the JSON is checked against the expected format before anything is written, and secrets are encrypted again with this installation's master key.

## Best Practices

- Create a backup before major updates and before moving to a new machine.
- Keep backups in more than one place, and not on the same disk as OwnShell.
- Do not share backup files. Anyone with the file and its password gets all of your credentials.
- Test a restore from time to time.

## Troubleshooting

**"Wrong password"**: the backup password is wrong. There is no way to recover it.

**"Invalid vault file"**: the file is not an OwnShell backup, it is damaged, or its contents do not match the expected format.

**"Vault version … is newer than supported"**: update OwnShell, then import again.

For more help, see the [FAQ](/faq).
