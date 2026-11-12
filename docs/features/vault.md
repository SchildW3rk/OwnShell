# Smart Admin Vault

The Admin Vault is OwnShell's secure credential and environment variable manager.

**<SCREENSHOT: Vault overview>**

## What can the Vault store?

- **Passwords & API Keys** - Encrypted credentials for any service
- **.env Files** - Complete environment variable sets for projects
- **Global Variables** - Reusable secrets across connections

## Creating your first Vault Entry

1. Open the **Vault** tab in the sidebar
2. Click **"New Entry"**
3. Choose entry type:
   - **Secret** - Single key-value pair
   - **ENV Group** - Multiple variables for a project

**<SCREENSHOT: New vault entry>**

### Example: Storing a Database Password

```
Name: Production DB Password
Type: Secret
Key: DB_PASSWORD
Value: ••••••••••••
```

Click **"Save"** to encrypt and store the secret.

## ENV Groups for Projects

ENV Groups let you manage multiple environment variables together:

**<SCREENSHOT: ENV group editor>**

### Creating an ENV Group

1. Click **"New Entry"** → **"ENV Group"**
2. Name your group (e.g., "Production API")
3. Add variables:

```env
API_KEY=sk_live_abc123xyz
DATABASE_URL=postgresql://user:pass@localhost:5432/db
REDIS_HOST=redis.example.com
STRIPE_SECRET=sk_test_def456
```

4. Click **"Save"**

## Deploying .env Files to Servers

One of Vault's most powerful features: **One-click ENV deployment**.

**<SCREENSHOT: ENV upload dialog>**

1. Right-click an ENV Group
2. Select **"Upload to Server"**
3. Choose:
   - **Target Connection** (your SSH server)
   - **Remote Path** (e.g., `/var/www/app/.env`)
4. Click **"Deploy"**

✅ Your `.env` file is now securely uploaded!

### Use Case: Deploy to Multiple Environments

Create separate ENV Groups for each environment:

- `Production API` → Deploy to `/var/www/prod/.env`
- `Staging API` → Deploy to `/var/www/staging/.env`
- `Development API` → Deploy to `/home/dev/app/.env`

One click deploys the correct variables to each environment.

## Using Vault Variables in Connections

You can reference Vault secrets in your SSH connections:

**<SCREENSHOT: Using vault variable in connection>**

When creating a connection, use the **"From Vault"** button to insert a secret instead of typing it directly.

## Security

- All vault data is encrypted with **AES-256-GCM**
- Master password is never stored anywhere
- Vault database is stored locally:
  - **macOS**: `~/Library/Application Support/OwnShell/vault.db`
  - **Windows**: `%APPDATA%/OwnShell/vault.db`
  - **Linux**: `~/.config/OwnShell/vault.db`

### Changing Your Master Password

1. Go to **Settings** → **Security**
2. Click **"Change Master Password"**
3. Enter old and new passwords
4. The entire vault is re-encrypted with the new password

## Backup Your Vault

::: warning Important
Always backup your vault before major updates!
:::

See [Backup & Restore](/advanced/backup-restore) for detailed instructions.

## Best Practices

✅ **DO:**

- Use strong master passwords (16+ characters)
- Organize secrets with clear naming conventions
- Regularly backup your vault
- Use ENV Groups for related variables

❌ **DON'T:**

- Share your master password
- Store master password in plain text
- Commit vault backups to Git (they're encrypted but still sensitive)
