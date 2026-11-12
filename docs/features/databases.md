# Database Client

Connect to MySQL, PostgreSQL, Redis, MongoDB, and SQLite directly from OwnShell.

**<SCREENSHOT: Database explorer interface>**

## Supported Databases

| Database   | Version Support | Features                       |
| ---------- | --------------- | ------------------------------ |
| MySQL      | 5.7+            | Query editor, table browser    |
| PostgreSQL | 10+             | Full SQL support, schemas      |
| Redis      | 5.0+            | Key browser, TTL management    |
| MongoDB    | 4.0+            | Document browser, aggregations |
| SQLite     | 3.x             | Local file browser             |

## Connecting to a Database

### PostgreSQL Example

1. Open the **Database** tab
2. Click **"New Connection"**
3. Fill in details:

**<SCREENSHOT: New DB connection dialog>**

```
Type: PostgreSQL
Host: localhost
Port: 5432
Database: myapp_production
Username: postgres
Password: ••••••••
```

4. Click **"Test Connection"** to verify
5. **Save** to add to your connections

### MySQL Example

```
Type: MySQL
Host: db.example.com
Port: 3306
Database: wordpress
Username: wp_user
Password: ••••••••
```

### Using Vault Credentials

Instead of typing passwords, use the **"From Vault"** button to select a stored credential.

**<SCREENSHOT: Using vault credential for database>**

## Running SQL Queries

**<SCREENSHOT: SQL editor>**

Use the built-in SQL editor to run queries:

```sql
SELECT * FROM users
WHERE created_at > '2026-01-01'
ORDER BY email;
```

### Editor Features

- **Syntax Highlighting** - Color-coded SQL
- **Auto-complete** - Table and column suggestions
- **Multi-query** - Run multiple queries separated by `;`
- **Query History** - Access successful and failed previous queries when history is enabled
- **Execute Shortcut** - Cmd/Ctrl + Enter runs the query, like the Execute button

Large query results retain all returned rows and their query order; only the visible row window and a small scroll buffer are mounted. Scrolling reaches the final returned row without a new result limit. A later execution owns the result, loading and error state, so an older response cannot overwrite it.

### Exporting Results

After running a query, export results as:

- **CSV** - For Excel/spreadsheets
- **JSON** - For APIs/scripts
- **SQL** - For migrations

**<SCREENSHOT: Export results menu>**

## Table Browser

Browse table data visually without writing SQL:

**<SCREENSHOT: Table browser>**

1. Expand a database in the sidebar
2. Click on a table
3. View data in a paginated grid

Features:

- **Pagination** - Navigate large tables in 100-row pages
- **Ordering and data filters** - Use SQL `ORDER BY` and `WHERE` in the query console
- **Table search** - Filter metadata/table names in the explorer sidebar

## Redis Client

**<SCREENSHOT: Redis key browser>**

The Redis client provides:

### Key Browser

- View all keys with pattern matching (`user:*`, `session:*`)
- Group by prefix for easier navigation
- See key types (string, hash, list, set, zset)

Search uses Redis `SCAN MATCH`, the selected type filter and a `COUNT 100` hint, not a total-result limit. **Load More** continues the submitted pattern/type and cursor; draft edits do not change that scan until submitted. An empty matching page can still offer **Load More**. Continue until Redis returns cursor `0`.

Viewport rendering retains the complete loaded key sequence and Redis iteration order. `SCAN` is not a snapshot: modifying the keyspace can produce duplicates or changing results.

### Key Editor

**<SCREENSHOT: Redis key editor>**

Edit different data types:

- **String**: Simple text editor
- **Hash**: Field-value pairs
- **List**: Add/remove items
- **Set**: Manage unique values

Selecting another key starts a separate value view. Earlier replies cannot replace its value, loading state or error. Type, value and TTL come from the same existing response; complete values and list order remain intact.

### TTL Management

Set expiration for keys:

```
SET user:123:token "abc123"
EXPIRE user:123:token 3600
```

Or use the UI: Right-click → **"Set TTL"** → Enter seconds

## MongoDB Client

**<SCREENSHOT: MongoDB collection browser>**

### Collections & Documents

1. Browse collections in the sidebar
2. View documents with syntax highlighting
3. Edit documents directly in JSON format

The browser retains 50-document pages, filters and complete document contents. Changing collection, filter, page or selection retires the previous view's pending updates without cancelling already-submitted database writes.

The editor retains its CodeMirror document and undo history. A local worker formats the selected snapshot and validates composed incremental edits; obsolete results cannot replace the current selection. Save parses the current complete editor text.

Browse and by-ID replies carry the complete normalized JSON snapshot, ID and all root field names across Electron's context bridge. Opening a row uses that snapshot, not a new projection, limit or follow-up query. While formatting, the UI shows loading and prevents editing incomplete contents. Supported normalized types, field order, copy/save data and read-only restrictions remain unchanged.

### Aggregation Pipeline

Run MongoDB aggregations:

**<SCREENSHOT: Aggregation builder>**

```javascript
[
  { $match: { status: 'active' } },
  { $group: { _id: '$country', count: { $sum: 1 } } },
  { $sort: { count: -1 } },
];
```

## SQLite Files

**<SCREENSHOT: Open SQLite file>**

For local SQLite databases:

1. Click **"Open File"** in Database tab
2. Select your `.db` or `.sqlite` file
3. Browse and query like any other database

Perfect for:

- Local development databases
- Analyzing app data
- Working with Electron app databases

## Connection Management

### Save Frequently Used Connections

Mark connections as **"Favorite"** for quick access:

**<SCREENSHOT: Favorite connections>**

### Connection Groups

Organize connections by environment:

- **Production** (red badge)
- **Staging** (yellow badge)
- **Development** (green badge)

### SSH Tunnel Support

Connect to databases through SSH tunnels:

**<SCREENSHOT: Database via SSH tunnel>**

1. Enable **"Connect via SSH"**
2. Select your SSH connection
3. Enter database credentials
4. OwnShell creates the tunnel automatically

This is perfect for databases that are only accessible from within a private network.

## Best Practices

✅ **DO:**

- Use SSH tunnels for remote databases
- Store credentials in Vault
- Use read-only users for production queries
- Test queries on development first

❌ **DON'T:**

- Run `DROP` or `DELETE` without WHERE clauses
- Store production passwords in connection settings
- Query large tables without LIMIT
- Run long-running queries on production during peak hours

## Troubleshooting

### Connection Timeout

If connection fails:

1. Check database server is running
2. Verify firewall allows connections
3. Test credentials manually: `mysql -h HOST -u USER -p`
4. Try SSH tunnel if direct connection fails

### Permission Denied

Your database user may need:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON database.* TO 'user'@'%';
FLUSH PRIVILEGES;
```

### Slow Queries

Add indexes to frequently queried columns:

```sql
CREATE INDEX idx_email ON users(email);
```

For more help, see the [FAQ](/faq).
