# FAQ

## Allgemein

### Welche Plattformen werden unterstützt?

macOS auf Apple Silicon. Es gibt keine Builds für Windows, Linux oder Intel-Macs.

### Ist OwnShell kostenlos und Open Source?

Ja. OwnShell ist freie Software unter der [GNU General Public License v3.0](https://github.com/SchildW3rk/OwnShell/blob/main/LICENSE) (GPL-3.0-only), für die private und die berufliche Nutzung. Es gibt keine Bezahlversion, keinen Lizenzschlüssel und keinen Testzeitraum. Der Quellcode liegt auf [GitHub](https://github.com/SchildW3rk/OwnShell).

### Brauche ich ein Konto oder eine Internetverbindung?

Kein Konto. OwnShell funktioniert offline; nur Update-Prüfungen und Release Notes nutzen das Internet. Siehe [Datenschutz & Netzwerk](/de/privacy).

### Wie aktualisiere ich?

OwnShell prüft automatisch auf Updates und zeigt einen Hinweis an. Heruntergeladene Updates werden beim Beenden oder mit **Jetzt installieren** installiert. Du kannst die neueste Version auch von [ownshell.app](https://ownshell.app/) herunterladen.

### Kann ich mein Setup zwischen Macs synchronisieren?

Nicht automatisch. Nutze ein verschlüsseltes [Backup](/de/advanced/backup-restore), um deine Daten umzuziehen. Team Vaults mit selbst gehosteter, Ende-zu-Ende-verschlüsselter Synchronisierung sind geplant, aber noch nicht verfügbar.

## Sicherheit

### Welche Verschlüsselung nutzt OwnShell?

Secrets werden mit AES-256-GCM verschlüsselt. Der Schlüssel wird aus deinem Master-Passwort abgeleitet (PBKDF2-HMAC-SHA256, 100.000 Iterationen) und nur im Arbeitsspeicher gehalten, solange OwnShell entsperrt ist. Details unter [Installation & erster Start](/de/getting-started#so-sind-deine-daten-geschutzt).

### Ich habe mein Master-Passwort vergessen.

Nutze **Passwort vergessen? Mit Wiederherstellungsschlüssel zurücksetzen** auf dem Sperrbildschirm. Dabei bleiben Hosts und Einstellungen erhalten, aber alle gespeicherten Secrets werden gelöscht. Ohne den Wiederherstellungsschlüssel gibt es keine Möglichkeit, die Daten wiederherzustellen.

### Kann ich mein Master-Passwort ändern?

Noch nicht. Siehe [Installation & erster Start](/de/getting-started#wiederherstellungsschlussel-sichern).

### Sammelt OwnShell Daten?

Keine Analytics, kein Nutzungs-Tracking, keine automatischen Crash- oder Diagnoseberichte. Bugs und Feedback gehen per E-Mail an support@ownshell.app.

### Wie prüft OwnShell SSH-Host-Keys?

Integrierte SSH-Verbindungen vertrauen dem Schlüssel eines Servers bei der ersten Nutzung und verweigern die Verbindung, wenn er sich später ändert. Das native Terminal nutzt die `known_hosts` von OpenSSH. Siehe [Host-Key-Prüfung](/de/features/ssh#host-key-prufung).

## Verbindungen

### Unterstützt OwnShell Jump-Hosts?

Ja, auch Ketten aus mehreren Jump-Hosts. Siehe [Jump-Hosts](/de/features/ssh#jump-hosts).

### Kann ich ssh-agent nutzen?

Nein. Nutze Passwort-Authentifizierung oder importiere deinen privaten Schlüssel unter **Tresor → SSH-Schlüssel**.

### Kann ich Hosts aus einem anderen Tool importieren?

Noch nicht. Hosts werden in OwnShell angelegt oder aus einem OwnShell-Backup wiederhergestellt.

### Kann ich eine Datenbank erreichen, die nur auf localhost lauscht?

Ja. Verbinde sie über einen SSH-Host ([Datenbanken](/de/features/databases#uber-einen-ssh-host)) oder erstelle einen [Tunnel](/de/features/ssh#tunnel).

### Kann ich eine interne API aufrufen, die nur von meinem Server aus erreichbar ist?

Ja. Wähle den Server als Route des Requests ([API-Client](/de/features/api-client#senden-uber-einen-ssh-host)).

## Dateien und Docker

### Kann ich Dateien zu S3 hochladen?

Nicht in OwnShell. Der S3-Browser listet, löscht und erstellt Download-Links und verwaltet Bucket-CORS.

### Kann ich einen lokalen Ordner mit einem Server synchronisieren?

Nein, Ordner-Synchronisierung ist nicht verfügbar.

### Braucht OwnShell Root für Docker?

Nein, und es verwendet nie `sudo`. Dein SSH-Benutzer braucht Zugriff auf Docker, zum Beispiel über die Mitgliedschaft in der Gruppe `docker`.
