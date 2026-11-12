# Häufig gestellte Fragen

## Allgemein

### Wo werden meine Daten gespeichert?

Alle deine Daten (Verbindungen, Vault, Einstellungen) werden **lokal** auf deinem Rechner gespeichert:

- **macOS**: `~/Library/Application Support/OwnShell/`
- **Windows**: `%APPDATA%/OwnShell/`
- **Linux**: `~/.config/OwnShell/`

OwnShell sendet **niemals** deine Daten an einen Cloud-Service.

### Kann ich meine Konfiguration über Geräte synchronisieren?

Noch nicht automatisch, aber du kannst die [Import/Export-Funktion](/de/advanced/backup-restore) nutzen:

1. Exportiere Konfiguration auf Rechner A
2. Speichere in Cloud-Storage (Dropbox, Google Drive)
3. Importiere auf Rechner B

Team Sync mit verschlüsselter Cloud-Synchronisation ist für Q4 2026 geplant.

### Wie aktualisiere ich OwnShell?

OwnShell prüft automatisch auf Updates. Wenn eine neue Version verfügbar ist:

1. Du siehst eine Benachrichtigung
2. Klicke auf **"Update herunterladen"**
3. Installiere und starte neu

Oder lade manuell von [GitHub Releases](https://github.com/T2rtl3/ownshell/releases) herunter.

## Sicherheit & Datenschutz

### Welche Verschlüsselung nutzt OwnShell?

**AES-256-GCM** (Galois/Counter Mode) - derselbe Verschlüsselungsstandard wie:

- US-Regierung für klassifizierte Daten
- Apple für iCloud Keychain
- Signal für Nachrichten

Alle Vault-Daten werden vor dem Schreiben auf die Festplatte verschlüsselt.

### Was passiert, wenn ich mein Master-Passwort vergesse?

Leider **können wir es nicht wiederherstellen**. Das ist beabsichtigt - dein Master-Passwort verlässt niemals dein Gerät und wird nirgendwo gespeichert.

Wenn du es verlierst, musst du den Vault zurücksetzen (und verlierst alle gespeicherten Secrets).

**Prävention**:

- Speichere Master-Passwort in einem Passwort-Manager
- Erstelle regelmäßig [verschlüsselte Backups](/de/advanced/backup-restore)

### Sammelt OwnShell irgendwelche Daten?

**Nein**. OwnShell hat null Telemetrie:

- Keine Analytics
- Keine Crash-Reports
- Kein Usage-Tracking
- Keine "Phone-Home"-Verbindungen

Die einzigen Netzwerk-Anfragen sind:

1. Lizenzaktivierung und -aktualisierung, nur wenn du einen Lizenzschlüssel eingibst
2. Update-Checks (via GitHub API)

Bugs und Feedback werden manuell per E-Mail an `support@ownshell.app` gemeldet. OwnShell sendet keine automatischen Crash-, Fehler- oder Diagnoseberichte.

### Kann ich OwnShell offline nutzen?

Ja. OwnShell braucht kein Konto und funktioniert **100% offline**. Nur das Aktivieren eines Lizenzschlüssels braucht eine Verbindung.

## Lizenzierung

### Ist OwnShell kostenlos?

Für die private Nutzung ja: Die offiziellen Builds sind kostenlos, brauchen kein Konto, und alle Funktionen sind dauerhaft ohne Einschränkung nutzbar.

Wenn du OwnShell beruflich oder für umsatzbringende Tätigkeiten nutzt, kauf bitte eine Lizenz. Das ist ein Vertrauensmodell: In keinem Fall wird etwas gesperrt.

### Wie funktioniert der Testzeitraum?

Du kannst OwnShell ab dem ersten Start 30 Tage lang testen. Der Testzeitraum läuft komplett lokal, ohne Konto und ohne Zahlungsdaten. Währenddessen zeigt ein kleines Badge in der Kopfzeile die verbleibenden Tage.

Nach 30 Tagen ohne Lizenz zeigt das Badge **Persönliche Nutzung**. Ein Klick darauf öffnet einen Dialog: Du kannst bestätigen, dass du OwnShell nur privat nutzt (das blendet das Badge aus, wird nur lokal gespeichert und lässt sich unter Einstellungen → Lizenz zurücknehmen), eine Lizenz kaufen oder einen Lizenzschlüssel eingeben.

### Was kostet eine Lizenz?

- **Individual**: 79 € pro Jahr, inkl. MwSt.

Eine Business-Variante ist geplant. Siehe [Preis-Seite](https://ownshell.app/#pricing).

### Was passiert, wenn meine Lizenz abläuft?

Nichts hört auf zu funktionieren. Deine Lizenz deckt dauerhaft alle OwnShell-Versionen ab, die vor ihrem Ablaufdatum erschienen sind („Updates bis“). Neuere Versionen zeigen einen kleinen Hinweis in der Kopfzeile, und der Updater weist dich vor der Installation darauf hin, wenn ein Update nicht abgedeckt ist. Verlängere die Lizenz für neuere Versionen oder bleib bei einer abgedeckten Version.

### Kann ich meine Lizenz auf einen anderen Computer übertragen?

Ja. Deaktiviere sie auf dem alten Gerät:

1. Einstellungen → Lizenz
2. Klicke auf **Dieses Gerät deaktivieren**
3. Gib denselben Lizenzschlüssel auf dem neuen Gerät ein

Jede Lizenz erlaubt **3 Aktivierungen**.

## SSH & Verbindungen

### Unterstützt OwnShell Jump Hosts?

Ja! Siehe den [Jump Hosts Guide](/de/features/jump-hosts).

### Kann ich eigene SSH-Schlüssel nutzen?

Absolut. OwnShell unterstützt:

- RSA, ECDSA, Ed25519 Schlüssel
- Passwort-geschützte Schlüssel
- SSH Agent Forwarding
- Mehrere Schlüssel pro Verbindung

### Warum läuft meine SSH-Verbindung ins Timeout?

Häufige Ursachen:

1. **Firewall blockiert** - Prüfe ob Port 22 offen ist
2. **Falsche Zugangsdaten** - Verifiziere Username/Passwort
3. **SSH läuft nicht** - `sudo systemctl status sshd`
4. **Falscher Port** - Standard ist 22, prüfe `/etc/ssh/sshd_config`

Aktiviere Keep-Alive um Idle-Disconnects zu verhindern:

1. Einstellungen → SSH
2. Aktiviere "Keep-Alive Pakete senden"
3. Setze Intervall: 60 Sekunden

## Vault

### Kann ich meine Vault-Daten exportieren?

Ja, via [Backup & Restore](/de/advanced/backup-restore):

1. Einstellungen → Backup & Restore
2. Konfiguration exportieren
3. Vault-Daten einschließen
4. Speichern als verschlüsselt oder plain JSON

### Kann ich Vault-Einträge mit meinem Team teilen?

Noch nicht. Team Sync kommt in Q4 2026, das wird ermöglichen:

- End-to-End verschlüsseltes Vault-Sharing
- Team-spezifische ENV-Gruppen
- Rollenbasierte Zugriffskontrolle

### Wie ändere ich mein Vault Master-Passwort?

1. Einstellungen → Sicherheit
2. Klicke "Master-Passwort ändern"
3. Gib altes und neues Passwort ein
4. Klicke "Speichern"

Der gesamte Vault wird automatisch mit dem neuen Passwort neu verschlüsselt.

## Datenbanken

### Welche Datenbanken werden unterstützt?

- **MySQL** (5.7+)
- **PostgreSQL** (10+)
- **Redis** (5.0+)
- **MongoDB** (4.0+)
- **SQLite** (3.x)

### Kann ich zu Datenbanken über SSH-Tunnel verbinden?

Ja! Siehe [Datenbank-Client](/de/features/databases#ssh-tunnel-support).

## Docker

### Unterstützt OwnShell Docker Compose?

Noch nicht. Docker Compose Support ist für v1.20 geplant:

- Alle Services in einem Compose-Projekt anzeigen
- Ganze Stacks starten/stoppen
- Aggregierte Logs anzeigen

## Fehlerbehebung

### OwnShell startet nicht

**macOS**:

```bash
# Logs prüfen
cat ~/Library/Logs/OwnShell/main.log

# Einstellungen zurücksetzen
rm -rf ~/Library/Application\ Support/OwnShell/settings.json
```

### Hohe CPU-Auslastung

Häufige Ursachen:

1. **Viele Terminal-Tabs offen** - Schließe ungenutzte Tabs
2. **Scrollback-Buffer zu groß** - Einstellungen → Terminal → Scrollback (reduziere auf 1000 Zeilen)
3. **Auto-Refresh aktiviert** - Deaktiviere in Docker/Datenbank-Tabs

### Anwendung stürzt ab

1. Prüfe Crash-Logs (Orte oben)
2. Aktualisiere auf neueste Version
3. Setze Einstellungen zurück (Backup zuerst!)
4. Kontaktiere `support@ownshell.app`

## Benötigst du noch Hilfe?

- **Bug Report**: `support@ownshell.app`
- **Feature Request**: `support@ownshell.app`
- **Email Support**: `support@ownshell.app`

**Premium Support** (Jährlich/Lifetime Nutzer):

- Prioritäts-Antwort (24h)
- Direkte Email-Unterstützung
- Screenshare Debugging-Sessions
