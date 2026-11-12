# Keyboard Shortcuts

Master OwnShell with these productivity-boosting keyboard shortcuts.

## Global Shortcuts

| Shortcut       | Action                         |
| -------------- | ------------------------------ |
| `Cmd/Ctrl + N` | New SSH connection             |
| `Cmd/Ctrl + T` | New terminal tab               |
| `Cmd/Ctrl + W` | Close current tab              |
| `Cmd/Ctrl + Q` | Quit OwnShell                  |
| `Cmd/Ctrl + ,` | Open Settings                  |
| `Cmd/Ctrl + K` | Quick search / Command palette |

## Navigation

| Shortcut               | Action            |
| ---------------------- | ----------------- |
| `Cmd/Ctrl + 1-9`       | Switch to tab 1-9 |
| `Cmd/Ctrl + [`         | Previous tab      |
| `Cmd/Ctrl + ]`         | Next tab          |
| `Cmd/Ctrl + Shift + [` | Move tab left     |
| `Cmd/Ctrl + Shift + ]` | Move tab right    |

## Terminal

| Shortcut       | Action                    |
| -------------- | ------------------------- |
| `Ctrl + C`     | Interrupt current process |
| `Ctrl + D`     | Exit shell (disconnect)   |
| `Ctrl + L`     | Clear terminal            |
| `Cmd/Ctrl + F` | Find in terminal          |
| `Cmd/Ctrl + +` | Increase font size        |
| `Cmd/Ctrl + -` | Decrease font size        |
| `Cmd/Ctrl + 0` | Reset font size           |

## Clipboard

| Shortcut               | Action                |
| ---------------------- | --------------------- |
| `Cmd/Ctrl + C`         | Copy selected text    |
| `Cmd/Ctrl + V`         | Paste from clipboard  |
| `Cmd/Ctrl + Shift + C` | Copy (terminal mode)  |
| `Cmd/Ctrl + Shift + V` | Paste (terminal mode) |

## File Browser (SFTP/S3)

| Shortcut       | Action                |
| -------------- | --------------------- |
| `Cmd/Ctrl + U` | Upload file           |
| `Cmd/Ctrl + D` | Download selected     |
| `Cmd/Ctrl + R` | Refresh file list     |
| `Delete`       | Delete selected files |
| `F2`           | Rename selected file  |
| `Cmd/Ctrl + A` | Select all            |
| `Space`        | Preview file          |

## Database Client

| Shortcut                   | Action                 |
| -------------------------- | ---------------------- |
| `Cmd/Ctrl + Enter`         | Execute query          |
| `Cmd/Ctrl + Shift + Enter` | Execute selected query |
| `Cmd/Ctrl + /`             | Comment/uncomment line |
| `Cmd/Ctrl + ]`             | Indent selection       |
| `Cmd/Ctrl + [`             | Outdent selection      |
| `Cmd/Ctrl + F`             | Find in query          |
| `Cmd/Ctrl + H`             | Find and replace       |

## Vault

| Shortcut            | Action                  |
| ------------------- | ----------------------- |
| `Cmd/Ctrl + N`      | New vault entry         |
| `Cmd/Ctrl + E`      | Edit selected entry     |
| `Cmd/Ctrl + Delete` | Delete selected entry   |
| `Cmd/Ctrl + C`      | Copy value to clipboard |
| `Cmd/Ctrl + F`      | Search vault            |

## Docker

| Shortcut       | Action                 |
| -------------- | ---------------------- |
| `Cmd/Ctrl + R` | Refresh container list |
| `Enter`        | View container logs    |
| `Cmd/Ctrl + L` | View logs (selected)   |
| `Cmd/Ctrl + S` | Start container        |
| `Cmd/Ctrl + P` | Stop container         |

## Tunnels

| Shortcut       | Action               |
| -------------- | -------------------- |
| `Cmd/Ctrl + N` | Create new tunnel    |
| `Space`        | Start/stop tunnel    |
| `Cmd/Ctrl + E` | Edit tunnel config   |
| `Delete`       | Delete tunnel config |

## Customizing Shortcuts

OwnShell allows custom keyboard shortcuts:

1. Go to **Settings** → **Keyboard**
2. Find the action you want to change
3. Click **"Record Shortcut"**
4. Press your desired key combination
5. Click **"Save"**

**<SCREENSHOT: Custom shortcuts settings>**

### Custom Shortcut Examples

```
Action: "Connect to Production Server"
Shortcut: Cmd+Shift+P

Action: "Open Database Explorer"
Shortcut: Cmd+Shift+D

Action: "Toggle Tunnel (Production DB)"
Shortcut: Cmd+Shift+T
```

## Tips & Tricks

### Command Palette

Press `Cmd/Ctrl + K` to open the command palette:

**<SCREENSHOT: Command palette>**

Type to quickly find:

- Connect to any server
- Open any database
- Start any tunnel
- Run any action

### Multi-cursor Editing (SQL Editor)

- `Cmd/Ctrl + Click` - Add cursor
- `Cmd/Ctrl + D` - Select next occurrence
- `Cmd/Ctrl + Shift + L` - Select all occurrences

### Quick Terminal Actions

- `Cmd/Ctrl + Click URL` - Open link in browser
- `Cmd/Ctrl + Click file path` - Open file in SFTP

## Platform Differences

### macOS

- `Cmd` = Command key (⌘)
- `Option` = Alt key (⌥)

### Windows/Linux

- `Ctrl` = Control key
- `Alt` = Alt key

Some shortcuts use platform-specific keys:

```
macOS: Cmd+N
Windows/Linux: Ctrl+N
```

OwnShell automatically adapts to your platform!

## Conflicts with System Shortcuts

If a shortcut doesn't work:

1. Check system keyboard shortcuts
2. macOS: System Preferences → Keyboard → Shortcuts
3. Disable conflicting shortcuts or customize in OwnShell

Common conflicts:

- `Cmd+Space` (Spotlight on macOS)
- `Ctrl+Alt+Delete` (Windows system)
- `Ctrl+Alt+T` (Linux terminal)

## Cheat Sheet

Print or download the keyboard shortcut cheat sheet:

**<SCREENSHOT: Printable cheat sheet>**

[Download PDF Cheat Sheet](#) (Coming soon)

Or press `Cmd/Ctrl + ?` in OwnShell to view the built-in help overlay.
