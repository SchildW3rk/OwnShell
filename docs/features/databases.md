# Databases

The **Database** tab connects to **PostgreSQL**, **MySQL**, **SQLite**, **Redis** and **MongoDB**.

![Database explorer with a table grid and query console](/screenshots/database.png)

## Connections

- Fill in host, port, user, password and database, or paste a connection URI (`postgres://`, `postgresql://`, `mysql://`, `redis://`, `rediss://`, `mongodb://`, `mongodb+srv://`).
- Passwords are encrypted with your master password.
- **SSL** is a single switch. For PostgreSQL and MySQL it encrypts the connection but **does not verify the server certificate**.

### Through an SSH host

Choose a saved SSH host and OwnShell forwards a local port on `127.0.0.1` to the database through that host (jump hosts included). You can also connect to a database that runs in a Docker container on the host: OwnShell looks up the container's address with `docker inspect`. The SSH connection closes when the last database connection using it disconnects.

### Read-only mode

Turn on **read-only** per connection to protect production data:

- **SQL**: only `SELECT`, `WITH`, `SHOW`, `DESCRIBE` and `EXPLAIN` statements run, and only without write keywords. PostgreSQL and MySQL additionally run them inside a read-only transaction; SQLite files open read-only.
- Row edits, inserts and deletes, schema changes and imports are blocked.
- **MongoDB**: document and collection writes are blocked; aggregations with `$out` or `$merge` are blocked.
- **Redis**: all write operations are blocked.
- Exports still work.

## Tables and queries

- Browse tables in a paginated grid. Double-click a cell to edit it. Rows can be deleted when the table has a primary key.
- The query console has syntax highlighting and table name completion. **⌘↩** runs the whole editor content.
- **Query history** is saved per connection (up to 100 entries), including failed queries, with time and row count. Passwords, tokens, keys and credentials in connection URIs are redacted before saving. Clear it per connection.

## Schema tools

- PostgreSQL: create and drop databases, schemas and tables. The create-table dialog covers name, type, length, nullable, primary key, default and unique.
- Create database users with access levels (login, read, read/write, admin) for PostgreSQL, MySQL, MongoDB and Redis.
- Existing tables cannot be altered in OwnShell.

## Import and export

Database dumps use the official tools:

| Engine | Tools |
| --- | --- |
| PostgreSQL | `pg_dump`, `psql` |
| MySQL | `mysqldump`, `mysql` |
| MongoDB | `mongodump`, `mongorestore` |
| Redis | `redis-cli --rdb` |

- Export to `.sql` or `.sql.gz` (schema only, data only, selected tables and `pg_dump` options).
- Import `.sql` / `.sql.gz`, optionally after truncating or dropping existing tables.
- For connections through an SSH host, the tools run **on the server** and the dump is streamed to your Mac, so they must be installed there. For direct connections they must be installed on your Mac. OwnShell tells you which tool is missing.

## Redis

Browse keys with a pattern (`SCAN`) and filter by type (string, hash, list, set, sorted set). View and edit values, rename keys, set or remove a TTL and delete keys. Server info and database stats are available. The browser uses database 0.

## MongoDB

Browse collections (create and drop), filter documents with a JSON query, page through results, and insert, edit or delete documents in a JSON editor.

## External CLI

For direct connections, open `psql`, `mysql`, `mongosh`, `redis-cli` or `sqlite3` in a local terminal with the connection details filled in.
