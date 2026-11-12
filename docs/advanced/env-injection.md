# ENV Variable Deployment

Deploy environment variables (.env files) from the Vault to your servers with one click.

**<SCREENSHOT: ENV deployment dialog>**

## Overview

Instead of manually editing `.env` files on servers via SSH, OwnShell lets you:

1. Store ENV variables securely in the Vault
2. Deploy them to multiple servers with one click
3. Version control your environment configs

## Setting Up ENV Groups

### Create an ENV Group in Vault

1. Open **Vault** tab
2. Click **"New Entry"** → **"ENV Group"**
3. Name your group (e.g., "Production API")
4. Add variables:

**<SCREENSHOT: ENV group editor>**

```env
# Application
NODE_ENV=production
APP_PORT=3000
APP_URL=https://api.example.com

# Database
DATABASE_URL=postgresql://user:pass@db.example.com:5432/prod
REDIS_URL=redis://cache.example.com:6379

# External Services
STRIPE_SECRET_KEY=sk_live_abc123
SENDGRID_API_KEY=SG.xyz789
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...

# Security
JWT_SECRET=your-super-secret-jwt-key
SESSION_SECRET=your-session-secret
```

5. Click **"Save"**

### Bulk ENV syntax

In **Security → Vault → Environments**, choose **Bulk Editor** to edit an environment as text. The existing syntax accepts `KEY=VALUE`, blank lines, `#` comments and double-quoted values, including multiline values. Single quotes remain literal value characters. Comments inside a double-quoted multiline value belong to that value.

Parsing remains permissive: malformed lines are skipped and unfinished multiline values are omitted until their closing quote. At least one complete variable is required to save. Named variables with empty values are retained; incomplete blank-key rows in simple mode are ignored.

CodeMirror retains text and undo/redo history while typing. Parsed-count feedback follows a 150 ms pause, but **Create**, **Update** and switching to the simple editor parse the current document directly rather than a delayed snapshot. Comments and blank lines are editor text, not stored variables; reopening or switching to simple mode regenerates text from the ordered key/value entries.

## Deploying to Servers

### Quick Deploy

1. Right-click ENV Group in Vault
2. Select **"Upload to Server"**
3. Choose options:

**<SCREENSHOT: ENV upload dialog>**

```
Connection: Production Server
Remote Path: /var/www/api/.env
Backup existing: ✓ Yes
Restart service: ✓ Yes (pm2 restart api)
```

4. Click **"Deploy"**

✅ Done! Your `.env` file is now on the server.

### What Happens Behind the Scenes

```bash
# OwnShell automatically runs:

# 1. Backup existing .env (if exists)
cp /var/www/api/.env /var/www/api/.env.backup.2026-02-13_10-30-45

# 2. Upload new .env
cat > /var/www/api/.env << 'EOF'
NODE_ENV=production
APP_PORT=3000
...
EOF

# 3. Set permissions
chmod 600 /var/www/api/.env
chown www-data:www-data /var/www/api/.env

# 4. Restart service (if configured)
pm2 restart api
```

## Multiple Environments

Manage separate ENV groups for each environment:

**<SCREENSHOT: Multiple ENV groups>**

### Example: API Service

Create three ENV groups:

**Production API**

```env
NODE_ENV=production
DATABASE_URL=postgresql://prod-db:5432/api
```

**Staging API**

```env
NODE_ENV=staging
DATABASE_URL=postgresql://staging-db:5432/api
```

**Development API**

```env
NODE_ENV=development
DATABASE_URL=postgresql://localhost:5432/api_dev
```

Deploy each to the correct server with one click!

## Advanced Options

### Backup Strategies

**<SCREENSHOT: Backup options>**

- **Always backup** - Keep previous .env (recommended)
- **Numbered backups** - Keep last 5 versions
- **No backup** - Overwrite directly (risky!)

### Post-Deploy Actions

**<SCREENSHOT: Post-deploy actions>**

Run commands after deployment:

```bash
# Restart PM2 app
pm2 restart api

# Reload systemd service
sudo systemctl reload my-app

# Run migrations
cd /var/www/app && npm run migrate

# Clear cache
redis-cli FLUSHDB
```

### File Permissions

Set custom permissions:

```
Owner: www-data
Group: www-data
Permissions: 600 (rw-------)
```

## Template Variables

Use placeholders in ENV groups:

**<SCREENSHOT: ENV templates>**

```env
APP_URL=https://{{DOMAIN}}
DATABASE_HOST={{DB_HOST}}
```

When deploying, OwnShell prompts for values:

```
DOMAIN → api.example.com
DB_HOST → db-prod.internal
```

Final deployed `.env`:

```env
APP_URL=https://api.example.com
DATABASE_HOST=db-prod.internal
```

Perfect for:

- Multi-tenant deployments
- Dynamic infrastructure
- Team environments

## Best Practices

✅ **DO:**

- Always enable backups before deploy
- Use template variables for server-specific values
- Test ENV changes on staging first
- Version control your ENV groups (export from Vault)
- Set restrictive permissions (600)

❌ **DON'T:**

- Deploy to production without testing
- Store ENV groups in Git (use Vault only)
- Share production ENV variables
- Forget to restart services after deploy

## Rollback

If something breaks after deployment:

1. Go to **Vault** → **ENV History**
2. Find previous version
3. Click **"Rollback"**

**<SCREENSHOT: ENV rollback>**

Or manually restore backup:

```bash
cp /var/www/api/.env.backup.2026-02-13_10-30-45 /var/www/api/.env
pm2 restart api
```

## Security

### Encryption in Transit

ENV deployment uses SSH encryption:

```
Your Machine → [Encrypted SSH] → Server
```

### At-Rest Security

On server:

- Set permissions: `chmod 600 .env`
- Owned by app user only
- Not readable by other users

### Audit Log

OwnShell logs all ENV deployments:

**<SCREENSHOT: ENV audit log>**

```
2026-02-13 10:30 - Deployed "Production API" to prod-server:/var/www/api/.env
2026-02-13 09:15 - Deployed "Staging API" to staging-server:/var/www/api/.env
```

## Integration with CI/CD

For automated deployments, export ENV group and use in your CI pipeline:

1. Export ENV group from Vault (encrypted JSON)
2. Store in GitHub Secrets
3. Decrypt in CI job
4. Deploy via script

Example GitHub Action:

```yaml
- name: Deploy ENV
  run: |
    echo "${{ secrets.PROD_ENV }}" > .env
    scp .env server:/var/www/api/.env
    ssh server 'pm2 restart api'
```

## Troubleshooting

### Deployment Failed

Check connection:

```bash
ssh user@server 'ls -la /var/www/api'
```

### Permission Denied

Ensure user has write access:

```bash
chown -R deploy-user:deploy-user /var/www/api
```

### Service Didn't Restart

Check service logs:

```bash
journalctl -u my-app -n 50
```

For more help, see the [FAQ](/faq).
