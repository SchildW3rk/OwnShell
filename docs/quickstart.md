# Quickstart Guide

Get up and running with OwnShell in less than 5 minutes.

## Installation

### macOS

Download the latest `.dmg` from [GitHub Releases](https://github.com/T2rtl3/ownshell/releases/latest).

**<SCREENSHOT: Download page>**

1. Open the `.dmg` file
2. Drag OwnShell to Applications
3. Launch OwnShell from Launchpad

### Windows

Download the `.exe` installer from [GitHub Releases](https://github.com/T2rtl3/ownshell/releases/latest).

1. Run the installer
2. Follow the installation wizard
3. Launch OwnShell from Start Menu

### Linux

Download the `.AppImage` from [GitHub Releases](https://github.com/T2rtl3/ownshell/releases/latest).

```bash
chmod +x OwnShell-*.AppImage
./OwnShell-*.AppImage
```

### First Launch

On first launch, macOS may ask for permission. Click "Open".

**<SCREENSHOT: First launch dialog>**

## Your First SSH Connection

1. Click **"New Connection"** in the sidebar
2. Enter your server details:
   - **Name**: My Server
   - **Host**: example.com
   - **Port**: 22
   - **Username**: root
3. Choose authentication method:
   - **Password** or **SSH Key**
4. Click **"Connect"**

**<SCREENSHOT: New connection dialog>**

You're now connected! 🎉

**<SCREENSHOT: Connected terminal view>**

## Next Steps

Now that you're connected, explore these features:

- [Set up the Admin Vault](/features/vault) - Store credentials securely
- [Connect to a database](/features/databases) - Manage your databases
- [Manage Docker containers](/features/docker) - Control your containers
- [Browse files with SFTP](/features/sftp-s3) - Navigate remote file systems

## Troubleshooting

### Connection Failed

If your connection fails, check:

- ✅ Server host and port are correct
- ✅ Firewall allows SSH connections (port 22)
- ✅ SSH key permissions are correct (`chmod 600 ~/.ssh/id_rsa`)

### SSH Key Not Working

Make sure your SSH key:

- Is in the correct format (RSA, ECDSA, or Ed25519)
- Has the correct permissions (600 for private key)
- Is not password-protected (or enter the passphrase when prompted)

For more help, see the [FAQ](/faq).
