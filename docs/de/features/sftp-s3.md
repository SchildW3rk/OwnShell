# SFTP & S3 Browser

Durchsuche und übertrage Dateien via SFTP oder S3-kompatiblem Storage.

**<SCREENSHOT: Dual-Pane Datei-Browser>**

## SFTP Datei-Browser

Nach SSH-Verbindung zeigt der SFTP-Browser dein Remote-Dateisystem.

### Große Verzeichnisse und Remote-Editor

SSH-Dateien und der eigenständige Dateitransfer behalten das vollständige Remote-Listing; gerendert werden nur sichtbare Zeilen. Sortierung, Filter und Auswahl gelten für die ganze geladene Liste, auch außerhalb des sichtbaren Ausschnitts. Es gibt kein neues Ergebnislimit. SSH-Dateien starten weiterhin nach Namen sortiert; der eigenständige Transfer behält zunächst die Serverreihenfolge.

Remote-Editoren behalten Syntax-Highlighting, Undo, Auswahl und Scrollposition, ohne bei jeder Taste das vollständige Dokument zu kopieren. UTF-8 und verlustfreies Latin-1 bleiben beim Speichern erhalten.

### Datei-Operationen

#### Dateien hochladen

1. Klicke auf **"Hochladen"**-Button
2. Wähle Dateien von deinem Computer
3. Dateien werden mit Fortschrittsbalken übertragen

#### Dateien herunterladen

1. Wähle Dateien/Ordner
2. Rechtsklick → **"Herunterladen"**
3. Wähle Ziel auf deinem Computer

#### Drag & Drop

**<SCREENSHOT: Drag-and-Drop-Übertragung>**

Ziehe einfach Dateien vom Desktop in OwnShell zum Hochladen!

### Berechtigungen verwalten

Rechtsklick auf Datei → **"Berechtigungen"**:

- **Besitzer** - Lesen, Schreiben, Ausführen
- **Gruppe** - Lesen, Schreiben, Ausführen
- **Andere** - Lesen, Schreiben, Ausführen

Gängige Berechtigungsmuster:

- **755** - rwxr-xr-x (Verzeichnisse)
- **644** - rw-r--r-- (Dateien)
- **600** - rw------- (sensible Dateien)

## S3 Browser

Verbinde dich mit AWS S3, MinIO oder jedem S3-kompatiblen Storage.

### Zu S3 verbinden

```
Service: AWS S3
Endpoint: s3.amazonaws.com
Region: us-east-1
Access Key: AKIA...
Secret Key: ••••••••
```

Für MinIO:

```
Service: MinIO
Endpoint: minio.example.com:9000
Access Key: minioadmin
Secret Key: ••••••••
```

### Große Objektlisten

Ordnerzeilen und Breadcrumbs navigieren zwischen Prefixen. **Mehr laden** hängt weitere Continuation-Token-Seiten in bestehender Reihenfolge an, ohne ein Gesamtlimit einzuführen. Die Auswahl gilt für die ganze geladene Liste. Ein Prefixwechsel entwertet ausstehende Antworten der vorherigen Ansicht. Objektzahl, Lade-, Wiederholen- und Seitennavigation folgen der gewählten Anwendungssprache.

### Hochladen zu S3

1. Navigiere zum gewünschten Bucket/Ordner
2. Klicke auf **"Hochladen"**
3. Wähle Speicherklasse:
   - **Standard** - Häufiger Zugriff
   - **Intelligent-Tiering** - Auto-Optimierung
   - **Glacier** - Archiv-Speicher

### Presigned URLs

Generiere temporäre Download-Links:

1. Rechtsklick Objekt → **"Teilen"**
2. Setze Ablaufzeit (1 Stunde bis 7 Tage)
3. Kopiere Link zum Teilen

## SFTP-Übertragungswarteschlange

Die Warteschlange nutzt pro Host ihren eigenen SFTP-Transport statt der Verbindung eines Browser-Panels. Das Schließen des Panels beendet keine aktiven Queue-Übertragungen. Explizites Trennen und das Beenden der Anwendung schließen ihre Transporte weiterhin.

Unerwarteter Verbindungsverlust beendet betroffene Versuche mit tatsächlichem Fehler und Teilfortschritt in der Historie. Es gibt weder stille Wiederholungen noch dauerhaft aktive, verwaiste Versuche. Pause, Fortsetzen und Abbrechen behalten ihre bisherige Bedeutung und Transfer-Identitäten.

## Best Practices

✅ **MACHE:**

- Nutze SSH-Schlüssel für SFTP (keine Passwörter)
- Setze korrekte Dateiberechtigungen
- Nutze S3-Versionierung für wichtige Daten

❌ **MACHE NICHT:**

- Sensible Dateien in öffentliche S3-Buckets hochladen
- Dateien ohne Überprüfung löschen
- Root-User für S3 nutzen (erstelle IAM-User)
