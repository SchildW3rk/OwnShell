# Schnellstart-Anleitung

Sei in weniger als 5 Minuten startklar mit OwnShell.

## Installation

### macOS

Lade die neueste `.dmg` von [GitHub Releases](https://github.com/T2rtl3/ownshell/releases/latest) herunter.

**<SCREENSHOT: Download-Seite>**

1. Öffne die `.dmg`-Datei
2. Ziehe OwnShell in den Programme-Ordner
3. Starte OwnShell vom Launchpad

### Windows

Lade den `.exe`-Installer von [GitHub Releases](https://github.com/T2rtl3/ownshell/releases/latest) herunter.

1. Führe den Installer aus
2. Folge dem Installations-Assistenten
3. Starte OwnShell aus dem Startmenü

### Linux

Lade das `.AppImage` von [GitHub Releases](https://github.com/T2rtl3/ownshell/releases/latest) herunter.

```bash
chmod +x OwnShell-*.AppImage
./OwnShell-*.AppImage
```

### Erster Start

Beim ersten Start fragt macOS möglicherweise nach Berechtigung. Klicke auf "Öffnen".

**<SCREENSHOT: Erster Start Dialog>**

## Deine erste SSH-Verbindung

1. Klicke auf **"Neue Verbindung"** in der Seitenleiste
2. Gib deine Server-Details ein:
   - **Name**: Mein Server
   - **Host**: example.com
   - **Port**: 22
   - **Benutzername**: root
3. Wähle die Authentifizierungsmethode:
   - **Passwort** oder **SSH-Schlüssel**
4. Klicke auf **"Verbinden"**

**<SCREENSHOT: Neue Verbindung Dialog>**

Du bist jetzt verbunden! 🎉

**<SCREENSHOT: Verbundene Terminal-Ansicht>**

## Nächste Schritte

Jetzt, wo du verbunden bist, erkunde diese Funktionen:

- [Admin Vault einrichten](/de/features/vault) - Sichere Credential-Speicherung
- [Datenbank verbinden](/de/features/databases) - Deine Datenbanken verwalten
- [Docker Container verwalten](/de/features/docker) - Container steuern
- [Dateien mit SFTP durchsuchen](/de/features/sftp-s3) - Remote-Dateisysteme navigieren

## Fehlerbehebung

### Verbindung fehlgeschlagen

Wenn die Verbindung fehlschlägt, prüfe:

- ✅ Server-Host und Port sind korrekt
- ✅ Firewall erlaubt SSH-Verbindungen (Port 22)
- ✅ SSH-Schlüssel-Berechtigungen sind korrekt (`chmod 600 ~/.ssh/id_rsa`)

### SSH-Schlüssel funktioniert nicht

Stelle sicher, dass dein SSH-Schlüssel:

- Im korrekten Format ist (RSA, ECDSA oder Ed25519)
- Die richtigen Berechtigungen hat (600 für privaten Schlüssel)
- Nicht passwortgeschützt ist (oder gib die Passphrase ein, wenn aufgefordert)

Für weitere Hilfe, siehe die [FAQ](/de/faq).
