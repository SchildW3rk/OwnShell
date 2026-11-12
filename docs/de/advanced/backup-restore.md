# Backup & Restore

Exportiere deine OwnShell-Daten in eine einzelne verschlüsselte Datei und stelle sie auf demselben oder einem anderen Rechner wieder her.

## Was wird gesichert?

- SSH-Hosts inklusive Passwörtern und gespeicherter Host-Keys
- SSH-Schlüssel (Private Keys und Passphrasen)
- Port-Forwarding-Tunnel
- Befehls-Snippets
- S3-Verbindungen inklusive Access Keys
- Sidebar-Ordner
- Vault-Zugangsdaten (Passwörter)
- Vault-Umgebungen inklusive aller Variablenwerte
- Datenbank-Verbindungen inklusive Passwörtern
- Projekte
- API-Client-Sammlungen und -Requests

**Nicht enthalten:** dein Master-Passwort und Recovery-Key, App-Einstellungen und Lizenzdaten, Abfrage- und Transfer-Verlauf sowie lokale Dateien wie SQLite-Datenbankdateien oder zwischengespeicherte Downloads.

## Backup erstellen

1. Entsperre OwnShell.
2. Öffne **Einstellungen** und wähle **Backup exportieren**.
3. Gib ein Backup-Passwort ein. Es ist unabhängig von deinem Master-Passwort.
4. Speichere die `.ownshell-vault`-Datei.

::: tip
Bewahre das Backup-Passwort in einem Passwort-Manager auf. Ohne es lässt sich das Backup nicht öffnen.
:::

## Backup wiederherstellen

1. Entsperre OwnShell.
2. Öffne **Einstellungen** und wähle **Backup importieren**.
3. Wähle die `.ownshell-vault`-Datei und gib ihr Backup-Passwort ein.

Eine Wiederherstellung **ersetzt** die gesicherten Daten in dieser Installation. Sie läuft in einer einzigen Datenbank-Transaktion: Schlägt etwas fehl, bleibt alles unverändert.

Backups älterer OwnShell-Versionen enthalten nur Hosts, Schlüssel, Tunnel, Snippets, S3-Verbindungen und Sidebar-Ordner. Beim Wiederherstellen einer solchen Datei bleiben Vault-Daten, Datenbank-Verbindungen, Projekte und API-Client-Daten unverändert. Da Datenbank-Verbindungen ersetzt werden, wird ihr Abfrage-Verlauf gelöscht.

## Dateiformat

Eine `.ownshell-vault`-Datei ist binär:

| Bytes | Inhalt |
| --- | --- |
| 8 | Magic `OWNVAULT` |
| 1 | Formatversion |
| 32 | scrypt-Salt |
| 16 | AES-GCM-IV |
| 16 | AES-GCM-Authentifizierungs-Tag |
| Rest | Verschlüsseltes, gzip-komprimiertes JSON |

Der Schlüssel wird mit scrypt (N=16384, r=8, p=1) aus dem Backup-Passwort abgeleitet, die Daten werden mit AES-256-GCM verschlüsselt. In der Datei liegen Geheimnisse im Klartext, geschützt nur durch das Backup-Passwort. Beim Import wird das JSON vor dem Schreiben auf das erwartete Format geprüft, und Geheimnisse werden mit dem Master-Key dieser Installation neu verschlüsselt.

## Best Practices

- Erstelle ein Backup vor größeren Updates und vor dem Umzug auf einen neuen Rechner.
- Bewahre Backups an mehr als einem Ort auf, nicht auf derselben Festplatte wie OwnShell.
- Teile keine Backup-Dateien. Wer Datei und Passwort hat, hat alle deine Zugangsdaten.
- Teste gelegentlich eine Wiederherstellung.

## Fehlerbehebung

**„Wrong password“**: Das Backup-Passwort ist falsch. Es lässt sich nicht wiederherstellen.

**„Invalid vault file“**: Die Datei ist kein OwnShell-Backup, beschädigt oder ihr Inhalt entspricht nicht dem erwarteten Format.

**„Vault version … is newer than supported“**: Aktualisiere OwnShell und importiere erneut.

Weitere Hilfe findest du in den [FAQ](/de/faq).
