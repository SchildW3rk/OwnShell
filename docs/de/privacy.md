# Datenschutz & Netzwerk

OwnShell ist local-first. Es braucht **kein Konto**, hat **keine Telemetrie, keine Analytics und kein Crash-Reporting** und synchronisiert keine Workspace-Daten in eine Cloud.

## Wo deine Daten liegen

Alles wird auf deinem Mac im Datenordner von OwnShell unter `~/Library/Application Support/` gespeichert:

- `ownshell.db`: eine lokale SQLite-Datenbank mit Hosts, Verbindungen, Vault, Projekten, API-Collections und Einstellungen. Secrets darin sind mit deinem Master-Passwort verschlüsselt (AES-256-GCM).
- `logs/ownshell.log`: ein lokales Log (max. 10 MB). Passwörter, Schlüssel und Terminalausgaben werden herausgefiltert. Logs werden nie irgendwohin gesendet.

## Verbindungen, die OwnShell selbst aufbaut

| Was | Wohin | Wann |
| --- | --- | --- |
| Update-Prüfung | `release.ownshell.app` | 5 Sekunden nach dem Start, danach alle 30 Minuten. Der automatische Download ist optional (standardmäßig aus); die Prüfung selbst lässt sich nicht abschalten. |
| Release Notes | `release.ownshell.app/releases.json` | Nur wenn sich das Fenster *Was ist neu* öffnet, z. B. nach einem Update. |
| Lizenz | `license.ownshell.app` | Nur wenn du einen Lizenzschlüssel eingibst: bei der Aktivierung, bei der Deaktivierung und um die signierte Lizenz zu erneuern, wenn sie bald abläuft. |

Die Lizenzaktivierung sendet den Lizenzschlüssel, eine gehashte Geräte-ID (SHA-256 der Hardware-UUID des Macs; die rohe ID wird nie gesendet), die App-Version und die Plattform.

Die Benutzeroberfläche der App selbst kann keinen externen Server kontaktieren.

## Verbindungen, die du startest

Alles andere wird von dir ausgelöst und geht **direkt von deinem Mac** zu deiner eigenen Infrastruktur: SSH, SFTP, S3-Endpoints, Datenbanken, Docker über SSH, Requests des API-Clients (direkt oder über einen deiner SSH-Hosts) und OAuth-Logins in deinem Browser.

## Support

Es gibt keine automatische Fehlermeldung. Wenn etwas schiefgeht, schreib an support@ownshell.app und hänge nur an, was du teilen möchtest.
