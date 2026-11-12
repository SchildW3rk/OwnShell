# SSH Tunneling & Port Forwarding

Create secure tunnels to access remote services through encrypted SSH channels.

**<SCREENSHOT: Tunnel list>**

## What is SSH Tunneling?

SSH tunneling lets you securely access services that are:

- Behind a firewall
- Only accessible from localhost
- On a private network

## Types of Tunnels

### Local Port Forwarding

Forward a local port to a remote service.

**<SCREENSHOT: Create local tunnel>**

**Example: Access Remote Database**

```
Local Port: 3306
Remote Host: localhost
Remote Port: 3306
```

Now connect to `localhost:3306` on your machine to access the remote database!

```bash
mysql -h localhost -P 3306 -u user -p
```

**Use Cases:**

- Access remote databases
- Connect to admin panels (phpMyAdmin, Adminer)
- Reach services behind firewall

### Remote Port Forwarding

Forward a remote port to your local service.

**<SCREENSHOT: Create remote tunnel>**

**Example: Expose Local Web Server**

```
Remote Port: 8080
Local Host: localhost
Local Port: 3000
```

Now `server:8080` forwards to your local `localhost:3000`!

**Use Cases:**

- Demo local development to clients
- Webhook testing (Stripe, PayPal)
- Temporary external access

### Dynamic Port Forwarding (SOCKS Proxy)

Create a SOCKS proxy through the SSH server.

**<SCREENSHOT: SOCKS proxy setup>**

```
Local Port: 1080
```

Configure your browser to use `localhost:1080` as SOCKS5 proxy.

**Use Cases:**

- Browse internal web applications
- Access geo-restricted services
- Secure browsing through trusted server

## Creating a Tunnel

1. Open **Tunnels** tab
2. Click **"New Tunnel"**
3. Select type (Local/Remote/Dynamic)
4. Enter ports and hosts
5. Click **"Start"**

**<SCREENSHOT: Tunnel configuration>**

### Auto-Start Tunnels

Enable **"Auto-start on connect"** to automatically create tunnel when connecting to server.

**<SCREENSHOT: Auto-start toggle>**

Perfect for frequently used tunnels like databases.

## Managing Tunnels

### Active Tunnels

**<SCREENSHOT: Active tunnel status>**

See all active tunnels with:

- **Status** - Green (active) / Red (failed)
- **Ports** - Local → Remote mapping
- **Connection** - Which SSH connection hosts the tunnel

### Start/Stop Tunnels

Click **"Start"** or **"Stop"** to control tunnels.

### Saved Configurations

Save tunnel configs for reuse:

**<SCREENSHOT: Saved tunnel configs>**

1. Create tunnel
2. Click **"Save Configuration"**
3. Name it (e.g., "Production DB Tunnel")
4. Reuse anytime with one click

## Practical Examples

### Example 1: Access Remote MySQL

**Problem**: MySQL only allows localhost connections for security.

**Solution**: SSH tunnel!

```
Type: Local Forward
Local Port: 3307 (avoid conflict with local MySQL)
Remote Host: localhost
Remote Port: 3306
```

Connect with:

```bash
mysql -h 127.0.0.1 -P 3307 -u user -p
```

### Example 2: Access Admin Panel

**Problem**: phpMyAdmin is only accessible from `localhost`.

**Solution**:

```
Type: Local Forward
Local Port: 8080
Remote Host: localhost
Remote Port: 80
```

Open browser: `http://localhost:8080/phpmyadmin`

### Example 3: Webhook Testing

**Problem**: Stripe webhooks can't reach your local development server.

**Solution**:

```
Type: Remote Forward
Remote Port: 8080
Local Host: localhost
Local Port: 3000
```

Configure Stripe webhook: `https://yourserver.com:8080/webhook`

## Best Practices

✅ **DO:**

- Use high ports (>1024) for local forwarding
- Save frequently used tunnel configs
- Enable auto-start for database tunnels
- Document tunnel purposes

❌ **DON'T:**

- Expose production databases publicly
- Use default ports (conflicts likely)
- Forget to stop tunnels (security risk)
- Share tunnel ports with untrusted users

## Troubleshooting

### Port Already in Use

If you get "Address already in use":

```bash
# Check what's using the port
lsof -i :3306
kill <PID>
```

### Tunnel Drops Frequently

Enable **"Keep-Alive"** in SSH settings:

1. Settings → SSH
2. Enable "Send keep-alive packets"
3. Set interval: 60 seconds

### Cannot Connect Through Tunnel

Check tunnel status is green. If red:

1. Verify remote service is running
2. Check firewall rules
3. Restart SSH connection

For more help, see the [FAQ](/faq).
