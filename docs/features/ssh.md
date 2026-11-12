# Terminals & SSH

![Native SSH terminal with split panes](/screenshots/terminal.png)

## Hosts

Add a host with **Label**, **Address**, **Port** (default 22) and **Username**.

- **Connection type**: *SSH + SFTP* (terminal and all tools) or *SFTP Only* (file transfers, no terminal).
- **Authentication**: *Password* or *Key*. Passwords are encrypted with your master password. When editing, leave the password empty to keep the current one. ssh-agent is not used.
- **Jump host**: *Direct* or another saved host (see [Jump hosts](#jump-hosts)).

Hosts, S3 connections and databases can be organized in sidebar **folders** and marked as **favorites**. Saving a host needs OwnShell to be unlocked.

## SSH keys

Keys are managed in **Vault → SSH Keys**.

- **Import Private Key** reads an OpenSSH or PEM private key file (OwnShell does not generate keys).
- Enter the passphrase if the key has one. Key and passphrase are stored encrypted.
- In a host, choose *Key* and pick the imported key.

## Sessions and terminals

Opening a host starts a **session** with the tabs **Terminal**, **Files**, **Tunnels**, **Docker** and **Database**. A local session has **Terminal** and **Docker**.

OwnShell uses two SSH terminals:

| Host | Terminal |
| --- | --- |
| No jump host | **Native OpenSSH terminal**: runs `/usr/bin/ssh` in a real PTY, with keep-alive (`ServerAliveInterval=30`). Your `~/.ssh/config` applies. |
| With jump host | **Built-in SSH terminal** (ssh2) that connects through the jump chain. |

- With **key auth**, the native terminal hands the decrypted key to `ssh` through a temporary file readable only by you (mode 0600), deleted after use.
- With **password auth**, the native terminal does not pass the saved password: type it at the `ssh` prompt.
- The **Files**, **Tunnels**, **Docker** and **Database** tabs always use a separate built-in SSH connection.

### Local terminal

A local session opens your login shell (`$SHELL`, otherwise `/bin/zsh`) in your home directory, with `TERM=xterm-256color` and `TERM_PROGRAM=OwnShell`.

### Panes

Open several sessions side by side. OwnShell arranges them automatically: one pane, a split (horizontal or vertical) for two, and a grid for three or more. ⌘W closes the active pane.

Terminals keep 5000 lines of scrollback. Font and font size (10–24) are set in **Settings**; Nerd Font presets are included.

### Snippets

Save frequently used commands as **snippets** with a label, command and optional category. Toggle the snippets panel with **Ctrl+Shift+S** in the active terminal; running a snippet types the command and presses Enter.

## Host key verification

- **Built-in SSH connections** (Files, Tunnels, Docker, Database tabs, jump hosts, the built-in terminal) use **trust on first use**: the first connection stores the server's SHA256 host key fingerprint for that host. Every later connection must present the same key. If it changes, OwnShell refuses to connect and shows both fingerprints.
- If the server key changed on purpose (reinstall, new server), open the host's edit form, check the stored fingerprint and click **Reset host key**. The next connection trusts the new key. Changing a host's address or port clears the stored key automatically.
- Jump hosts are verified the same way, each against its own stored key.
- The **native OpenSSH terminal** uses OpenSSH's own `~/.ssh/known_hosts` and prompts, independent of the key stored in OwnShell.

## Jump hosts

Pick a jump host in the host form. If that jump host has its own jump host, OwnShell follows the chain, so multi-hop setups work. Loops are rejected when you save. Each hop uses its own saved credentials, with a 30-second timeout per hop.

Jump hosts apply to the built-in terminal, SFTP, tunnels, Docker and databases. Hosts with a jump host always use the built-in terminal.

## Tunnels

The **Tunnels** tab creates **local port forwards** (like `ssh -L`): a port on your Mac forwards to a host and port as seen from the server.

- The local side listens on `127.0.0.1` only. OwnShell checks whether the port is free.
- Save a tunnel with name, local port, remote host and remote port. **Auto start** starts saved tunnels when a session connects with the built-in SSH client.
- **Active** lists running tunnels with their client count and a Stop button.
- **Discovered services** lists listening ports on the server (via `ss`, or `netstat` as fallback) and Docker container ports, ready to forward in one click.

Remote (`-R`) and dynamic/SOCKS (`-D`) forwarding are not supported.
