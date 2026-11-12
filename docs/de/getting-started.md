# Installation & erster Start

OwnShell ist eine Desktop-App für macOS auf **Apple Silicon** (M1 oder neuer). Builds für Windows oder Linux gibt es nicht.

## Installation

1. Lade die aktuelle `.dmg` von [ownshell.app](https://ownshell.app/) herunter.
2. Öffne die `.dmg` und zieh **OwnShell** in **Programme**.
3. Starte OwnShell aus Programme oder dem Launchpad.

Release-Builds sind von Apple signiert und notarisiert, macOS öffnet sie ohne Zusatzschritte.

## Master-Passwort anlegen

Beim ersten Start fragt OwnShell nach einem **Master-Passwort**. Damit werden die Secrets verschlüsselt, die OwnShell speichert: Host-Passwörter, SSH-Schlüssel, Datenbank- und S3-Zugangsdaten, Vault-Einträge, als Secret markierte Variablen im API-Client, Tokens, Passwörter, API-Keys und OAuth-Client-Secrets in den **Auth**-Feldern eines Requests, OAuth-Tokens, Cookies und dein Lizenzschlüssel.

Das Passwort braucht mindestens 8 Zeichen mit einem Großbuchstaben, einem Kleinbuchstaben und einer Ziffer.

### Wiederherstellungsschlüssel sichern

Danach zeigt OwnShell einmalig einen **Wiederherstellungsschlüssel** im Format `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`. Kopier ihn in einen Passwortmanager, bestätige die Checkbox und mach weiter.

::: warning Es gibt keinen anderen Weg zurück
Wenn du das Master-Passwort vergisst, kannst du nur mit dem Wiederherstellungsschlüssel ein neues setzen. Ohne ihn kann niemand (auch wir nicht) deine Daten entsperren.

Ein Zurücksetzen mit dem Wiederherstellungsschlüssel behält Hosts und Verbindungseinstellungen, **löscht aber alle gespeicherten Secrets**: Passwörter, private Schlüssel, Passphrasen, API-Tokens, Cookies und den Lizenzschlüssel. Diese gibst du danach neu ein.
:::

Eine Funktion „Master-Passwort ändern“ gibt es derzeit nicht. Für ein neues Passwort: [Backup](/de/advanced/backup-restore) anlegen und über den Wiederherstellungsschlüssel zurücksetzen.

### So sind deine Daten geschützt

- Der Schlüssel wird mit PBKDF2-HMAC-SHA256 (100.000 Iterationen, zufälliger Salt) aus deinem Master-Passwort abgeleitet.
- Secrets werden mit **AES-256-GCM** verschlüsselt, bevor sie in die lokale Datenbank geschrieben werden.
- Der Schlüssel liegt nur im Arbeitsspeicher, solange OwnShell entsperrt ist, und wird beim Sperren gelöscht.

## Sperren und Auto-Sperre

- Klick im Header auf **Sperren**, um OwnShell jederzeit zu sperren.
- OwnShell sperrt sich nach einer Zeit ohne Tastatur- oder Mausaktivität. Standard sind **5 Minuten**; ändern kannst du das (1–60 Minuten) unter **Einstellungen → Allgemein → Sicherheit → Auto-Sperre**.
- OwnShell sperrt sich immer, wenn dein Mac in den Ruhezustand geht oder der Bildschirm gesperrt wird.

Nach jedem Neustart entsperrst du mit deinem Master-Passwort.

## Testzeitraum und Lizenz-Badge

OwnShell setzt auf ein **Vertrauensmodell**. Keine Funktion wird je gesperrt.

- **Private Nutzung ist kostenlos**, mit allen Funktionen und ohne Konto.
- **Berufliche Nutzung** (Arbeit oder umsatzbezogene Tätigkeiten) erfordert eine **Individual-Lizenz: 79 € pro Jahr inkl. MwSt.** Siehe [Preise](https://ownshell.app/#pricing).

Das Badge im Header zeigt deinen Stand:

| Badge | Bedeutung |
| --- | --- |
| **Testzeitraum · N Tage** | Die ersten 30 Tage nach dem ersten Start. Läuft lokal, ohne Konto oder Zahlungsdaten. |
| **Persönliche Nutzung** | Der Testzeitraum ist vorbei und keine Lizenz ist eingetragen. Klick darauf, um private Nutzung zu bestätigen (nur auf diesem Gerät gespeichert; rückgängig unter **Einstellungen → Lizenz**), eine Lizenz zu kaufen oder einen Schlüssel einzugeben. |
| **Lizenz deckt diese Version nicht ab** | Du hast eine Lizenz, aber dieser Build ist nach ihrem „Updates bis“-Datum erschienen. |
| *(kein Badge)* | Du hast private Nutzung bestätigt, oder deine Lizenz deckt diesen Build ab. |

### Was passiert, wenn eine Lizenz abläuft

Eine Lizenz deckt **jede Version ab, die vor ihrem „Updates bis“-Datum erschienen ist, für immer**. Läuft sie ab, hört nichts auf zu funktionieren. Neuere Versionen zeigen den Hinweis oben, und der Updater installiert ein Update, das deine Lizenz nicht abdeckt, nicht automatisch. Verlängere für neuere Versionen oder bleib bei einer abgedeckten.

### Lizenz aktivieren, umziehen oder deaktivieren

- Gib deinen Schlüssel über das Badge oder **Einstellungen → Lizenz** ein. Die Aktivierung braucht eine Internetverbindung; was dabei gesendet wird, steht unter [Datenschutz & Netzwerk](/de/privacy).
- Eine Lizenz kann auf 3 Geräten aktiv sein. Zum Umziehen auf dem alten Mac **Einstellungen → Lizenz → Dieses Gerät deaktivieren** wählen (braucht eine Verbindung), dann den Schlüssel auf dem neuen eingeben.

## Updates

OwnShell sucht kurz nach dem Start und danach alle 30 Minuten nach Updates. Unter **Einstellungen → Allgemein → Updates** legst du fest, ob Updates automatisch heruntergeladen werden (standardmäßig aus). Ein heruntergeladenes Update wird beim Beenden installiert oder sofort über **Jetzt installieren**.

## Nächste Schritte

- [Mit deinem ersten Server verbinden](/de/features/ssh)
- [Dateien per SFTP durchsuchen](/de/features/files)
- [Secrets im Vault speichern](/de/features/vault)
- [Deinen ersten API-Request senden](/de/features/api-client)
