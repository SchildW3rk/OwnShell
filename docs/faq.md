# Frequently Asked Questions

## General

### Where is my data stored?

All your data (connections, vault, settings) is stored **locally** on your machine:

- **macOS**: `~/Library/Application Support/OwnShell/`
- **Windows**: `%APPDATA%/OwnShell/`
- **Linux**: `~/.config/OwnShell/`

OwnShell **never** sends workspace data such as credentials, SSH keys, terminal output, database content, S3 objects, or API request bodies to an OwnShell cloud service.

### Can I sync my configuration across devices?

Not yet automatically, but you can use the [Import/Export feature](/advanced/backup-restore):

1. Export configuration on Machine A
2. Save to cloud storage (Dropbox, Google Drive)
3. Import on Machine B

Team Vaults with self-hosted, end-to-end encrypted sync are planned as a future company feature.

### How do I update OwnShell?

OwnShell checks for updates automatically. When a new version is available:

1. You'll see a notification
2. Click **"Download Update"**
3. Install and restart

Or manually download the latest version from the OwnShell website.

### Is OwnShell open source?

Yes. The OwnShell source code is MIT-licensed and available on GitHub. The official builds are free for personal use; commercial use asks for a license (see [Licensing](#licensing)).

## Security & Privacy

### What encryption does OwnShell use?

**AES-256-GCM** (Galois/Counter Mode) - the same encryption standard used by:

- US Government for classified data
- Apple for iCloud Keychain
- Signal for messages

All vault data is encrypted before being written to disk.

### What happens if I forget my master password?

Unfortunately, **we cannot recover it**. This is by design - your master password never leaves your device and is never stored anywhere.

If you lose it, you'll need to reset the Vault (losing all stored secrets).

**Prevention**:

- Store master password in a password manager
- Create regular [encrypted backups](/advanced/backup-restore)

### Does OwnShell collect any data?

OwnShell does not use analytics or usage tracking:

- No analytics
- No usage tracking
- No workspace data collection

The only application network requests are:

1. License activation and refresh, only if you enter a license key
2. Update checks

Bugs and feedback are reported manually by email to support@ownshell.app. OwnShell does not send automatic crash, error or diagnostics reports.

### Can I use OwnShell offline?

Yes. OwnShell needs no account and works **100% offline**. Only activating a license key needs a connection.

### Is my SSH password/key encrypted?

Yes. All credentials are encrypted with AES-256-GCM in the vault.

## Licensing

### Is OwnShell free?

For personal use, yes: the official builds are free, need no account, and every feature works without limits, forever.

If you use OwnShell for work or revenue-generating activities, please buy a license. This is an honor system: nothing is locked either way.

### How does the evaluation work?

You can evaluate OwnShell for 30 days from the first launch. The evaluation runs fully locally, with no account and no payment details. During that time a small badge in the header shows the days left.

After 30 days without a license, the badge shows **Personal use**. Click it to confirm that you only use OwnShell personally (this hides the badge and is stored locally only; you can undo it under Settings → License), buy a license, or enter a license key.

### What does a license cost?

- **Individual**: €79 per year, incl. VAT

A business tier is planned. See the [pricing page](https://ownshell.app/#pricing).

### What happens when my license expires?

Nothing stops working. Your license covers every OwnShell version released before its expiry date ("updates until"), forever. Newer versions show a small notice in the header, and the updater tells you before installing an update your license does not cover. Renew to get newer versions, or stay on a covered version.

### Can I transfer my license to another computer?

Yes. Deactivate it on the old machine:

1. Settings → License
2. Click **Deactivate this device**
3. Enter the same license key on the new machine

Each license allows **3 activations**.

## SSH & Connections

### Does OwnShell support Jump Hosts?

Yes! See the [Jump Hosts guide](/features/jump-hosts).

### Can I use custom SSH keys?

Absolutely. OwnShell supports:

- RSA, ECDSA, Ed25519 keys
- Password-protected keys
- SSH Agent forwarding
- Multiple keys per connection

### Why does my SSH connection timeout?

Common causes:

1. **Firewall blocking** - Check port 22 is open
2. **Incorrect credentials** - Verify username/password
3. **SSH not running** - `sudo systemctl status sshd`
4. **Wrong port** - Default is 22, check `/etc/ssh/sshd_config`

Enable Keep-Alive to prevent idle disconnects:

1. Settings → SSH
2. Enable "Send keep-alive packets"
3. Set interval: 60 seconds

### Can I import connections from another tool?

Not yet directly, but you can:

1. Create connections manually (takes 2 min)
2. Use import/export for OwnShell backups

## Vault

### Can I export my Vault data?

Yes, via [Backup & Restore](/advanced/backup-restore):

1. Settings → Backup & Restore
2. Export Configuration
3. Include Vault data
4. Save as encrypted or plain JSON

### Can I share vault entries with my team?

Not yet. Team Vaults are planned as a future company feature and are intended to support:

- End-to-end encrypted vault sharing
- Self-hosted sync for company infrastructure
- Team-specific ENV groups
- Role-based access control

### How do I change my vault master password?

1. Settings → Security
2. Click "Change Master Password"
3. Enter old and new passwords
4. Click "Save"

The entire vault is re-encrypted with the new password automatically.

## Databases

### Which databases are supported?

- **MySQL** (5.7+)
- **PostgreSQL** (10+)
- **Redis** (5.0+)
- **MongoDB** (4.0+)
- **SQLite** (3.x)

### Can I connect to databases through SSH tunnels?

Yes! See [Database Client](/features/databases#ssh-tunnel-support).

### Why can't I connect to my database?

Check:

1. **Database is running**: `sudo systemctl status mysql`
2. **Port is correct**: MySQL=3306, PostgreSQL=5432, etc.
3. **Credentials are correct**: Test with `mysql -h HOST -u USER -p`
4. **Firewall allows connections**: `sudo ufw allow 3306`
5. **Database allows remote connections**: Check `bind-address` in config

For localhost-only databases, use [SSH tunneling](/features/tunneling).

## Docker

### Does OwnShell support Docker Compose?

Yes. OwnShell includes Docker Compose tooling for supported SSH hosts:

- View all services in a compose project
- Start/stop entire stacks
- Create and edit compose projects
- Run common compose actions from the Docker workspace

### Can I run Docker commands directly?

Yes, use the Shell Access feature:

1. Right-click container → "Shell Access"
2. Run any Docker command

Or open an SSH terminal and use Docker CLI normally.

## Files (SFTP/S3)

### Can I edit files directly?

Yes. OwnShell includes an SFTP file editor for supported text files:

- Open remote files in built-in editor
- Save changes back to the server
- Syntax highlighting

### Why is SFTP slow?

SFTP is slower than S3 because:

- Each file transfer requires SSH handshake
- No parallel transfers by default

Speed tips:

- Enable transfer queue parallelization
- Use compression (Settings → SSH → Compression)
- For large files, consider using S3 instead

### Can I sync local folder with remote?

Not yet. Folder sync is on the roadmap, but no release date has been announced.

## Troubleshooting

### OwnShell won't start

**macOS**:

```bash
# Check logs
cat ~/Library/Logs/OwnShell/main.log

# Reset settings
rm -rf ~/Library/Application\ Support/OwnShell/settings.json
```

**Windows**:

```
Check: %APPDATA%\OwnShell\logs\main.log
```

### High CPU usage

Common causes:

1. **Many terminal tabs open** - Close unused tabs
2. **Scrollback buffer too large** - Settings → Terminal → Scrollback (reduce to 1000 lines)
3. **Auto-refresh enabled** - Disable in Docker/Database tabs

### Application crashes

1. Check crash logs (locations above)
2. Update to latest version
3. Reset settings (backup first!)
4. Contact support at support@ownshell.app

## Still Need Help?

- **Bug Report**: support@ownshell.app
- **Feature Request**: support@ownshell.app
- **Email Support**: support@ownshell.app

**Premium Support** (Annual users):

- Priority response (24h)
- Direct email support
- Screenshare debugging sessions
