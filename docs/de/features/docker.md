# Docker-Verwaltung

Verwalte Docker-Container, Images und Logs direkt aus OwnShell.

**<SCREENSHOT: Docker Container-Liste>**

## Container anzeigen

Nach Verbindung zu einem Server klicke auf den **Docker**-Tab:

**<SCREENSHOT: Container-Übersicht>**

- **Laufende Container** (grüner Status)
- **Gestoppte Container** (grauer Status)
- **Container-Health** (falls Healthcheck konfiguriert)

## Container-Aktionen

Rechtsklick auf einen Container für Schnellaktionen:

- **Start** - Gestoppten Container starten
- **Stop** - Laufenden Container stoppen
- **Restart** - Container neustarten
- **Logs anzeigen** - Log-Viewer öffnen
- **Shell-Zugriff** - Bash/sh im Container öffnen
- **Inspect** - Volle Container-Details anzeigen

## Echtzeit-Logs

**<SCREENSHOT: Docker Logs-Viewer>**

Klicke auf **"Logs anzeigen"**:

- **Auto-Scroll** - Folge neuen Log-Zeilen
- **Suche** - Filter Logs nach Stichwort
- **Zeitstempel** - Ein-/Ausblenden
- **Löschen** - Log-Buffer leeren

## Exec in Container

**<SCREENSHOT: Container Shell>**

Öffne eine Shell in jedem laufenden Container:

1. Rechtsklick Container → **"Shell-Zugriff"**
2. Wähle Shell: `bash` oder `sh`
3. Interaktives Terminal öffnet sich

Beispiel-Anwendungsfälle:

- Dateiberechtigungen prüfen: `ls -la /app`
- Netzwerk testen: `ping database`
- Migrationen ausführen: `npm run migrate`

## Best Practices

✅ **MACHE:**

- Prüfe Logs vor Container-Neustarts
- Nutze Health Checks im Dockerfile
- Überwache Container-Ressourcenverbrauch

❌ **MACHE NICHT:**

- Container als Root in Produktion laufen lassen
- Docker Socket ungeschützten Nutzern zugänglich machen
- Warning-Logs ignorieren
