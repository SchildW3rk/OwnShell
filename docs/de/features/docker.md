# Docker

Der Tab **Docker** funktioniert in jeder SSH-Sitzung und in lokalen Sitzungen (mit der `docker`-CLI auf deinem Mac).

![Docker-Container mit Live-Auslastung und Logs](/screenshots/docker.png)

## Voraussetzungen

- Die `docker`-CLI muss auf dem Server installiert sein.
- OwnShell verwendet nie `sudo`. Bekommst du *permission denied*, füge deinen Benutzer zur Gruppe `docker` hinzu (`sudo usermod -aG docker $USER`) und verbinde dich neu.
- Compose-Projekte brauchen Compose v2 (`docker compose`).

## Container

- Liste Container auf und **starte**, **stoppe**, **starte neu** oder **entferne** sie (nur gestoppte Container lassen sich entfernen). Container eines Compose-Projekts lassen sich gemeinsam steuern.
- Container-Details:
  - **Nutzung**: CPU und Arbeitsspeicher aus `docker stats`, alle 2 Sekunden aktualisiert.
  - **Logs**: die letzten 100 Zeilen (bis zu 1000). Live-Verfolgung über SSH.
  - **Konsole**: eine Shell im Container (`docker exec -it … /bin/sh`), über SSH.
  - **Ports** (über SSH) und **Netzwerke**.

## Images und Netzwerke

- Images: auflisten, entfernen (optional erzwungen), aufräumen (optional alle ungenutzten Images).
- Netzwerke: auflisten, inspizieren, erstellen, entfernen, Container verbinden und trennen.

Volumes werden in OwnShell nicht verwaltet.

## Compose-Projekte

Der Tab **Compose-Projekte** (SSH-Sitzungen) findet `docker-compose.yml`- / `.yaml`-Dateien bis zu zwei Ordnerebenen tief unter `~/docker-compose` auf dem Server.

- **Neues Projekt** erstellt `~/docker-compose/<name>/docker-compose.yml`.
- Bearbeite die Datei in einem YAML-Editor.
- Führe **up**, **down**, **restart**, **pull**, **build** und **logs** aus.

::: danger Projekt entfernen
Das Entfernen eines Compose-Projekts führt `docker compose down` aus (optional mit `-v`, wodurch Volumes gelöscht werden) **und löscht den Projektordner** auf dem Server.
:::
