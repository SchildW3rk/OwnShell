# Backup & Wiederherstellung

Backups findest du unter **Einstellungen → Daten & Speicher**. Ein Backup ist eine einzelne verschlüsselte Datei, die du überall ablegen kannst, zum Beispiel um OwnShell auf einen neuen Mac umzuziehen.

## Was enthalten ist

- SSH-Hosts mit ihren Zugangsdaten, SSH-Schlüssel (private Schlüssel und Passphrasen)
- Tunnel und Snippets
- S3-Verbindungen und Datenbankverbindungen
- Vault-Zugangsdaten und Umgebungen
- Projekte
- API-Collections, Requests und globale API-Variablen
- Ordner der Seitenleiste

**Nicht enthalten**: App-Einstellungen, dein Master-Passwort und deine Lizenz (gib den Schlüssel auf einem neuen Mac erneut ein).

## Export

1. Entsperre OwnShell und öffne **Einstellungen → Daten & Speicher**.
2. Gib ein **Backup-Passwort** ein (mindestens 4 Zeichen). Es ist unabhängig von deinem Master-Passwort.
3. Exportiere. Der Standard-Dateiname ist `ownshell-backup-YYYY-MM-DD.ownshell-vault`.

Secrets werden mit deinem Master-Schlüssel entschlüsselt und mit dem Backup-Passwort neu verschlüsselt. Die Datei wird komprimiert und mit AES-256-GCM verschlüsselt, mit einem Schlüssel, der per scrypt aus dem Backup-Passwort abgeleitet wird.

::: tip
Nutze ein starkes Backup-Passwort: Wer die Datei und das Passwort hat, kann alle deine Zugangsdaten lesen.
:::

## Import

1. Öffne **Einstellungen → Daten & Speicher** und wähle die Backup-Datei.
2. Gib das Backup-Passwort ein.

::: danger Import ersetzt deine Daten
Ein Import **ersetzt** die entsprechenden Daten in OwnShell; er führt nichts zusammen. Er läuft in einer einzigen Transaktion: Schlägt etwas fehl, wird nichts verändert. Datentypen, die das Backup nicht enthält (aus älteren Versionen), bleiben unberührt. Backups einer neueren OwnShell-Version werden abgelehnt.
:::
