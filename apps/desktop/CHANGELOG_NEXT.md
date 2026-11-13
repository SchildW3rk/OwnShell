## Free and open source (unreleased)

- OwnShell is now free and open source under the GNU General Public License v3.0 (GPL-3.0-only), for private use and for work.
- Licensing is gone: no evaluation period, no license key, no license badge and no license check; the app only contacts OwnShell servers for update checks and downloads.

## Git workspace (unreleased)

- Restores the independent Git code browser and copyable SSH clone/add-remote commands, using the configured SSH host without Secure Node.
- Previews committed HEAD content only, bounds directory/file reads, and localizes binary/oversized preview errors in English and German.

## Performance (unreleased)

- Retains the original local-first desktop startup and `ownshell.db` vault while improving editor, list and workspace responsiveness.
- Renders visible SFTP, S3, SQL and Redis rows without truncating loaded results; preserves full-list selection and rejects stale responses.
- Keeps API/ENV editor drafts, undo, selection and scroll state; saves and sends the latest complete document.
- Formats and validates large API/MongoDB JSON off the renderer thread and transports complete MongoDB snapshots without deeply cloning their object graphs.
- Preserves Docker output framing/order, suspends hidden statistics polling and releases only closed or cancelled attachments.
- Keeps pane/editor/terminal state across layout changes, fits nonzero native terminal surfaces and preserves active transfers when SFTP panes close.
- Adds isolated real-Electron performance/startup runners using synthetic local services and the original local password/recovery flow, without a Node service dependency.
- Localizes newly introduced MongoDB processing failure messages in English and German.

## Hotfix v1.23.2

- Fixes the Docker tab in local terminal sessions so it can be opened instead of immediately switching back to the terminal.
