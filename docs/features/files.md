# Files: SFTP & S3

## SFTP

The **Files** tab of a session shows your Mac on the left and the server on the right. *SFTP Only* hosts open the same dual-pane browser on their own.

![Dual-pane SFTP browser](/screenshots/sftp.png)

- **Drag** files between the panes to upload or download. In a session's Files tab, upload folders one at a time; the standalone SFTP browser uploads whole folders.
- Right-click: **Download**, **Copy to other pane**, **Edit**, **Rename**, **Edit permissions**, **Delete**.
- Toolbar: **Refresh**, **Upload**, **New file**, **New folder**.
- **Edit permissions** shows owner/group/others checkboxes with a live octal preview.

::: warning
Existing files with the same name are overwritten without asking.
:::

### Transfer queue

Transfers run in a queue, 3 at a time. Each transfer can be paused, resumed or cancelled, and all transfers of a host can be cancelled at once. A resumed transfer starts the file again from the beginning.

### Editor

Double-click a text file (known extensions, dotfiles, `Dockerfile`, `Makefile`, `Caddyfile`) to open it in the built-in editor with syntax highlighting. ⌘S saves back to the server, Esc closes. Files up to 10 MB can be edited; other files are downloaded.

## S3 and S3-compatible storage

Add an S3 connection with **endpoint URL**, **region**, **access key**, **secret key** and an optional **default bucket**. Keys are encrypted. Use **Test** to check the connection.

- Works with AWS S3 and S3-compatible services such as MinIO. For endpoints outside `amazonaws.com`, OwnShell uses path-style URLs automatically.
- Browse buckets and prefixes with paging. Hover an image to preview it.
- Select objects and **delete** them (after a confirmation).
- Double-click a file or use **open** / **copy URL** to get a **presigned link** valid for 1 hour.

OwnShell's S3 browser does not upload, rename or copy objects.

### CORS editor

Open a bucket's CORS settings to add, edit or delete rules, or remove the whole configuration. Each rule has allowed origins (`*` allowed), methods (GET, PUT, POST, DELETE, HEAD), allowed headers, expose headers and max age (0–86400 seconds). Up to 100 rules per bucket.
