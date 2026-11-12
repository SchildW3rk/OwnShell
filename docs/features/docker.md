# Docker

The **Docker** tab works on every SSH session and on local sessions (using the `docker` CLI on your Mac).

![Docker containers with live usage and logs](/screenshots/docker.png)

## Requirements

- The `docker` CLI must be installed on the server.
- OwnShell never uses `sudo`. If you get *permission denied*, add your user to the `docker` group (`sudo usermod -aG docker $USER`) and reconnect.
- Compose projects need Compose v2 (`docker compose`).

## Containers

- List containers and **start**, **stop**, **restart** or **remove** them (only stopped containers can be removed). Containers of one compose project can be controlled together.
- Container details:
  - **Usage**: CPU and memory from `docker stats`, refreshed every 2 seconds.
  - **Logs**: the last 100 lines (up to 1000). Live follow over SSH.
  - **Console**: a shell inside the container (`docker exec -it … /bin/sh`), over SSH.
  - **Ports** (over SSH) and **Networks**.

## Images and networks

- Images: list, remove (optionally forced), prune (optionally all unused images).
- Networks: list, inspect, create, remove, connect and disconnect containers.

Volumes are not managed in OwnShell.

## Compose projects

The **Compose Projects** tab (SSH sessions) finds `docker-compose.yml` / `.yaml` files up to two folders deep under `~/docker-compose` on the server.

- **New project** creates `~/docker-compose/<name>/docker-compose.yml`.
- Edit the file in a YAML editor.
- Run **up**, **down**, **restart**, **pull**, **build** and **logs**.

::: danger Removing a project
Removing a compose project runs `docker compose down` (optionally with `-v`, which deletes volumes) **and deletes the project folder** on the server.
:::
