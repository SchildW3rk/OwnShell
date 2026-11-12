# Vault & Umgebungen

<!-- v-pre: {{…}} in this page is OwnShell variable syntax, not Vue interpolation -->
:::: v-pre

Der **Tresor** hat drei Tabs: **Anmeldedaten**, **Umgebungsvariablen** und **SSH-Schlüssel** (siehe [SSH-Schlüssel](/de/features/ssh#ssh-schlussel)).

![Tresor mit Umgebungen und Variablen](/screenshots/vault.png)

## Anmeldedaten

Speichere Logins mit Titel, Benutzername, Passwort, URL, Notizen, Tags und einer Favoriten-Markierung. **Nur das Passwort wird verschlüsselt**; Titel, Benutzername, URL, Notizen und Tags liegen im Klartext in der lokalen Datenbank, also halte Secrets dort heraus. **URL öffnen** öffnet http/https-Links in deinem Browser.

## Umgebungen

Eine Umgebung ist ein benannter Satz von Variablen, zum Beispiel `shop-production`. Sie hat einen Namen, optional eine Projektbezeichnung und Beschreibung, die Variablen und optional einen Host und einen Standard-Remote-Pfad für Uploads.

- Jeder Variablenwert wird mit deinem Master-Passwort verschlüsselt.
- Bearbeite Variablen einzeln oder wechsle in den **Bulk-Editor** und füge eine komplette `.env`-Datei ein. Der Bulk-Editor versteht `#`-Kommentare, Leerzeilen, Werte in Anführungszeichen und mehrzeilige Werte in doppelten Anführungszeichen.
- Umgebungen stehen im [API-Client](/de/features/api-client#variablen) als Variablen zur Verfügung: Wähle pro Request eine aus und nutze `{{KEY}}`.

### Eine .env-Datei auf einen Server hochladen

Wähle bei einer Umgebung **Auf SFTP-Server bereitstellen**, um sie per SFTP auf einen Server zu schreiben:

1. Lege den Ziel-Host in der Umgebung fest.
2. Gib den Remote-Pfad ein, zum Beispiel `/srv/shop/.env`.
3. OwnShell verbindet sich (mit den gespeicherten Zugangsdaten und dem Jump Host des Hosts), legt bei Bedarf den übergeordneten Ordner an und schreibt die Datei.

Die Datei wird mit den Berechtigungen **0600** (nur Lesen/Schreiben für den Besitzer) geschrieben, auch wenn sie eine bestehende Datei ersetzt. Der Zeitpunkt des letzten Uploads wird bei der Umgebung angezeigt.

::: warning Format
Die Datei enthält eine `KEY=VALUE`-Zeile pro Variable, im Format, das Docker Compose liest (`.env` und `env_file`):

- Namen müssen mit einem Buchstaben oder `_` beginnen und dürfen nur Buchstaben, Ziffern und `_` enthalten. Sonst wird der Upload abgelehnt.
- Werte, die nur aus Buchstaben, Ziffern und `_ . / : @ , + -` bestehen, werden ohne Anführungszeichen geschrieben.
- Alle anderen Werte werden in doppelten Anführungszeichen geschrieben, mit `\\`, `\"` und `\$` maskiert und Zeilenumbrüchen als `\n`. So kommen `#`, Leerzeichen, Anführungszeichen und `$` unverändert bei deiner Anwendung an (keine Variablen-Interpolation).

Eine bestehende Datei wird ersetzt, nicht gesichert.
:::

OwnShell injiziert keine Umgebungsvariablen in Terminal-Sitzungen.

## Verschlüsselung

Vault-Secrets werden mit AES-256-GCM verschlüsselt, mit einem Schlüssel, der aus deinem Master-Passwort abgeleitet wird (siehe [Installation & erster Start](/de/getting-started#so-sind-deine-daten-geschutzt)). Der Vault wird zusammen mit der App gesperrt.

::::
