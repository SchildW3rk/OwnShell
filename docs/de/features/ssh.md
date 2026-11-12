# Terminals & SSH

![Natives SSH-Terminal mit geteilten Panels](/screenshots/terminal.png)

## Hosts

Lege einen Host mit **Bezeichnung**, **Adresse**, **Port** (Standard 22) und **Benutzername** an.

- **Verbindungstyp**: *SSH + SFTP* (Terminal und alle Werkzeuge) oder *Nur SFTP* (Dateiübertragungen, kein Terminal).
- **Authentifizierung**: *Passwort* oder *Schlüssel*. Passwörter werden mit deinem Master-Passwort verschlüsselt. Lass das Passwort beim Bearbeiten leer, um das aktuelle zu behalten. ssh-agent wird nicht verwendet.
- **Jump Host**: *Direkt* oder ein anderer gespeicherter Host (siehe [Jump-Hosts](#jump-hosts)).

Hosts, S3-Verbindungen und Datenbanken lassen sich in der Seitenleiste in **Ordnern** organisieren und als **Favoriten** markieren. Zum Speichern eines Hosts muss OwnShell entsperrt sein.

## SSH-Schlüssel

Schlüssel verwaltest du unter **Tresor → SSH-Schlüssel**.

- **Schlüssel importieren** liest eine private Schlüsseldatei im OpenSSH- oder PEM-Format ein (OwnShell erzeugt keine Schlüssel).
- Gib die Passphrase ein, falls der Schlüssel eine hat. Schlüssel und Passphrase werden verschlüsselt gespeichert.
- Wähle in einem Host *Schlüssel* und den importierten Schlüssel aus.

## Sitzungen und Terminals

Wenn du einen Host öffnest, startet eine **Sitzung** mit den Tabs **Terminal**, **Dateien**, **Tunnel**, **Docker** und **Datenbank**. Eine lokale Sitzung hat **Terminal** und **Docker**.

OwnShell verwendet zwei SSH-Terminals:

| Host | Terminal |
| --- | --- |
| Kein Jump Host | **Natives OpenSSH-Terminal**: führt `/usr/bin/ssh` in einem echten PTY aus, mit Keep-Alive (`ServerAliveInterval=30`). Deine `~/.ssh/config` gilt. |
| Mit Jump Host | **Integriertes SSH-Terminal** (ssh2), das sich über die Jump-Kette verbindet. |

- Bei **Schlüssel-Authentifizierung** übergibt das native Terminal den entschlüsselten Schlüssel über eine temporäre Datei an `ssh`, die nur für dich lesbar ist (Modus 0600) und nach der Nutzung gelöscht wird.
- Bei **Passwort-Authentifizierung** übergibt das native Terminal das gespeicherte Passwort nicht: Tippe es am `ssh`-Prompt ein.
- Die Tabs **Dateien**, **Tunnel**, **Docker** und **Datenbank** nutzen immer eine separate integrierte SSH-Verbindung.

### Lokales Terminal

Eine lokale Sitzung öffnet deine Login-Shell (`$SHELL`, sonst `/bin/zsh`) in deinem Home-Verzeichnis, mit `TERM=xterm-256color` und `TERM_PROGRAM=OwnShell`.

### Panels

Öffne mehrere Sitzungen nebeneinander. OwnShell ordnet sie automatisch an: ein Panel, eine Teilung (horizontal oder vertikal) für zwei und ein Raster für drei oder mehr. ⌘W schließt das aktive Panel.

Terminals behalten 5000 Zeilen Scrollback. Schriftart und Schriftgröße (10–24) stellst du in den **Einstellungen** ein; Nerd-Font-Voreinstellungen sind enthalten.

### Snippets

Speichere häufig genutzte Befehle als **Snippets** mit Bezeichnung, Befehl und optionaler Kategorie. Blende das Snippets-Panel im aktiven Terminal mit **Ctrl+Shift+S** ein oder aus; beim Ausführen eines Snippets wird der Befehl eingetippt und Enter gedrückt.

## Host-Key-Prüfung

- **Integrierte SSH-Verbindungen** (Tabs Dateien, Tunnel, Docker, Datenbank, Jump-Hosts, das integrierte Terminal) nutzen **Trust on First Use**: Die erste Verbindung speichert den SHA256-Fingerprint des Host-Keys des Servers für diesen Host. Jede spätere Verbindung muss denselben Schlüssel vorweisen. Ändert er sich, verweigert OwnShell die Verbindung und zeigt beide Fingerprints an.
- Wurde der Server-Schlüssel absichtlich geändert (Neuinstallation, neuer Server), öffne das Bearbeitungsformular des Hosts, prüfe den gespeicherten Fingerprint und klicke auf **Host-Schlüssel zurücksetzen**. Die nächste Verbindung vertraut dem neuen Schlüssel. Änderst du Adresse oder Port eines Hosts, wird der gespeicherte Schlüssel automatisch gelöscht.
- Jump-Hosts werden genauso geprüft, jeder gegen seinen eigenen gespeicherten Schlüssel.
- Das **native OpenSSH-Terminal** nutzt die eigene `~/.ssh/known_hosts` und die Abfragen von OpenSSH, unabhängig vom in OwnShell gespeicherten Schlüssel.

## Jump-Hosts

Wähle im Host-Formular einen Jump Host. Hat dieser Jump Host selbst einen Jump Host, folgt OwnShell der Kette, sodass Multi-Hop-Setups funktionieren. Schleifen werden beim Speichern abgelehnt. Jeder Hop nutzt seine eigenen gespeicherten Zugangsdaten, mit einem Timeout von 30 Sekunden pro Hop.

Jump-Hosts gelten für das integrierte Terminal, SFTP, Tunnel, Docker und Datenbanken. Hosts mit Jump Host nutzen immer das integrierte Terminal.

## Tunnel

Der Tab **Tunnel** erstellt **lokale Portweiterleitungen** (wie `ssh -L`): Ein Port auf deinem Mac leitet an einen Host und Port weiter, wie ihn der Server sieht.

- Die lokale Seite lauscht nur auf `127.0.0.1`. OwnShell prüft, ob der Port frei ist.
- Speichere einen Tunnel mit Name, lokalem Port, Remote-Host und Remote-Port. **Automatisch bei Verbindung starten** startet gespeicherte Tunnel, wenn sich eine Sitzung mit dem integrierten SSH-Client verbindet.
- **Aktive Tunnel** listet laufende Tunnel mit ihrer Client-Anzahl und einem Stoppen-Button.
- **Gefundene Dienste** listet lauschende Ports auf dem Server (über `ss`, oder `netstat` als Fallback) und Ports von Docker-Containern, mit einem Klick weiterleitbar.

Remote- (`-R`) und dynamische/SOCKS-Weiterleitung (`-D`) werden nicht unterstützt.
