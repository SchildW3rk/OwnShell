# Docker Management

Manage Docker containers, images, and logs directly from OwnShell.

**<SCREENSHOT: Docker container list>**

## Prerequisites

Docker must be installed and running on your server. OwnShell connects via:

- **Local**: Docker socket (`/var/run/docker.sock`)
- **Remote**: SSH + Docker CLI

## Viewing Containers

After connecting to a server, click the **Docker** tab to see:

**<SCREENSHOT: Container overview>**

- **Running Containers** (green status)
- **Stopped Containers** (gray status)
- **Container Health** (if healthcheck configured)

## Container Actions

Right-click any container for quick actions:

**<SCREENSHOT: Container context menu>**

- **Start** - Start a stopped container
- **Stop** - Gracefully stop a running container
- **Restart** - Restart the container
- **View Logs** - Open log viewer
- **Shell Access** - Open bash/sh inside container
- **Inspect** - View full container details

## Real-time Logs

**<SCREENSHOT: Docker logs viewer>**

Click **"View Logs"** to see container output:

- **Auto-scroll** - Follow new log lines
- **Search** - Filter logs by keyword
- **Timestamps** - Show/hide timestamps
- **Clear** - Clear log buffer

SSH **Live** logs retain the existing latest 1,000 lines in arrival order. Transport chunks are not lines: unfinished lines, including split CR/LF pairs, continue in the next chunk. Visible updates are coalesced to an animation frame without throttling incoming output or adding another loss limit.

Hiding the workspace or selecting another Docker tab does not stop active logs or discard retained output. Hidden views defer rendering; statistics polling resumes only while its Usage view is visible.

### Example: Debugging a Web App

```bash
# Container: my-webapp
[2026-02-13 10:23:45] Starting web server on port 3000
[2026-02-13 10:23:46] Database connected: postgresql://...
[2026-02-13 10:23:47] Server listening on http://0.0.0.0:3000
```

Use the search box to find errors: `ERROR` or `WARN`

## Exec into Container

**<SCREENSHOT: Container shell>**

Open a shell inside any running container:

1. Right-click container → **"Shell Access"**
2. Choose shell: `bash` or `sh`
3. Interactive terminal opens

Example use cases:

- Check file permissions: `ls -la /app`
- Test network: `ping database`
- Run migrations: `npm run migrate`

Worker-backed SSH log and console attachments each own their background SSH transport. Closing, cancelling or failing an attachment releases only that transport, including connections still being initialized. Other Docker attachments, the user's SSH terminal, transfers and borrowed main/jump-host connections remain intact.

## Container Lifecycle

### Start Container

```bash
docker start my-webapp
```

Or use the UI: Right-click → **"Start"**

### Stop Container

```bash
docker stop my-webapp
```

Sends SIGTERM, waits 10s, then SIGKILL if needed.

### Restart Container

Useful after config changes:

```bash
docker restart my-webapp
```

## Images

**<SCREENSHOT: Docker images list>**

View all images on the server:

- **Size** - Image disk usage
- **Created** - When image was built
- **Tags** - Image tags

### Cleanup Unused Images

Remove dangling images to free space:

```bash
docker image prune -a
```

## Docker Compose (Coming Soon)

Support for Docker Compose projects is planned for v1.20:

- View all services
- Start/stop entire stacks
- View compose logs

## Best Practices

✅ **DO:**

- Check logs before restarting containers
- Use health checks in Dockerfile
- Monitor container resource usage
- Set restart policies for critical services

❌ **DON'T:**

- Run containers as root in production
- Expose Docker socket to untrusted users
- Ignore warning logs
- Restart containers without checking logs first

## Troubleshooting

### Cannot Connect to Docker

Ensure Docker is running:

```bash
sudo systemctl status docker
```

For remote servers, check SSH access:

```bash
ssh user@server 'docker ps'
```

### Permission Denied

Add your user to the Docker group:

```bash
sudo usermod -aG docker $USER
newgrp docker
```

For more help, see the [FAQ](/faq).
