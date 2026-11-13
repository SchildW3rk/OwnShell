## OwnShell 2.0

OwnShell is now **free and open source** under the GNU General Public License v3.0 (GPL-3.0-only), for private use and for work. The source code is on GitHub: `github.com/SchildW3rk/OwnShell`.

### Free for everyone
- No license key, evaluation period, license badge or license check anymore.
- The app contacts OwnShell servers only for update checks, release notes and downloads.
- Secure Node has been removed; everything runs locally and over your own SSH connections.

### API client
- GraphQL, WebSocket and Server-Sent Events next to REST.
- OAuth 2.0 (client credentials, authorization code with PKCE), cookie jar, inherited folder auth.
- Variables per request, folder, collection, environment and global; secrets stay encrypted.
- curl and Postman import, copy as curl, portable export, request history and a collection runner with assertions.
- Requests through an SSH host reach internal services with TLS verification.

### Projects and Git
- Flat Git view with syntax-highlighted code, rich diffs, history search and branch tracking.

### Databases
- SSL connections verify the server certificate by default (optional own CA). Existing SSL connections keep working as "Require, don't verify" and show a one-time hint.
- Export, import and clear use the connection's SSL settings and the configured database host; failed or corrupt dumps are reported instead of looking successful.
- Database passwords never appear on the server's command line or in logs.
- SQLite export/import, remote SQLite files (read-only copy), table creation for MySQL and SQLite, MongoDB aggregation pipelines.
- Redis export works with passwords and TLS. Redis import was removed: restore an RDB snapshot on the server.
- Connection errors are shown in your language.

### Security and fixes
- Host keys are verified on first use for every built-in SSH connection.
- API auth secrets are stored encrypted; `.env` uploads are quoted correctly.
- Many smaller fixes and performance improvements across SFTP, Docker, editors and terminals.
