# FAQ

## General

### Which platforms are supported?

macOS on Apple Silicon. There are no Windows, Linux or Intel Mac builds.

### Is OwnShell free and open source?

Yes. OwnShell is free software under the [GNU General Public License v3.0](https://github.com/SchildW3rk/OwnShell/blob/main/LICENSE) (GPL-3.0-only), for private use and for work. There is no paid version, no license key and no evaluation period. The source code is on [GitHub](https://github.com/SchildW3rk/OwnShell).

### Do I need an account or an internet connection?

No account. OwnShell works offline; only update checks and release notes use the internet. See [Privacy & network](/privacy).

### How do I update?

OwnShell checks for updates automatically and shows a notice. Downloaded updates install when you quit or with **Install now**. You can also download the latest version from [ownshell.app](https://ownshell.app/).

### Can I sync my setup between Macs?

Not automatically. Use an encrypted [backup](/advanced/backup-restore) to move your data. Team Vaults with self-hosted, end-to-end encrypted sync are planned, but not available yet.

## Security

### What encryption does OwnShell use?

Secrets are encrypted with AES-256-GCM. The key is derived from your master password (PBKDF2-HMAC-SHA256, 100,000 iterations) and kept only in memory while OwnShell is unlocked. Details in [Install & first launch](/getting-started#how-your-data-is-protected).

### I forgot my master password.

Use **Forgot password? Reset with Recovery Key** on the lock screen. This keeps hosts and settings but deletes all stored secrets. Without the recovery key there is no way to recover the data.

### Can I change my master password?

Not yet. See [Install & first launch](/getting-started#save-your-recovery-key).

### Does OwnShell collect data?

No analytics, no usage tracking, no automatic crash or diagnostics reports. Bugs and feedback go by email to support@ownshell.app.

### How does OwnShell verify SSH host keys?

Built-in SSH connections trust a server's key on first use and refuse to connect if it changes later. The native terminal uses OpenSSH's `known_hosts`. See [Host key verification](/features/ssh#host-key-verification).

## Connections

### Does OwnShell support jump hosts?

Yes, including chains of several jump hosts. See [Jump hosts](/features/ssh#jump-hosts).

### Can I use ssh-agent?

No. Use password authentication or import your private key into **Vault → SSH Keys**.

### Can I import hosts from another tool?

Not yet. Hosts are created in OwnShell or restored from an OwnShell backup.

### Can I reach a database that only listens on localhost?

Yes. Connect it through an SSH host ([Databases](/features/databases#through-an-ssh-host)) or create a [tunnel](/features/ssh#tunnels).

### Can I call an internal API that is only reachable from my server?

Yes. Select the server as the route of the request ([API client](/features/api-client#sending-through-an-ssh-host)).

## Files and Docker

### Can I upload files to S3?

Not in OwnShell. The S3 browser lists, deletes and creates download links, and manages bucket CORS.

### Can I sync a local folder with a server?

No, folder sync is not available.

### Does OwnShell need root for Docker?

No, and it never uses `sudo`. Your SSH user needs access to Docker, for example by being in the `docker` group.
