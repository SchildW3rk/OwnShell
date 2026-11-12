# Smart Admin Vault

Der Admin Vault ist OwnShells sicherer Credential- und Umgebungsvariablen-Manager.

**<SCREENSHOT: Vault-Übersicht>**

## Was kann der Vault speichern?

- **Passwörter & API-Schlüssel** - Verschlüsselte Zugangsdaten für jeden Dienst
- **.env-Dateien** - Komplette Umgebungsvariablen-Sets für Projekte
- **Globale Variablen** - Wiederverwendbare Secrets über Verbindungen hinweg

## Deinen ersten Vault-Eintrag erstellen

1. Öffne den **Vault**-Tab in der Seitenleiste
2. Klicke auf **"Neuer Eintrag"**
3. Wähle den Eintragstyp:
   - **Secret** - Einzelnes Schlüssel-Wert-Paar
   - **ENV-Gruppe** - Mehrere Variablen für ein Projekt

**<SCREENSHOT: Neuer Vault-Eintrag>**

### Beispiel: Datenbank-Passwort speichern

```
Name: Produktions-DB Passwort
Typ: Secret
Schlüssel: DB_PASSWORD
Wert: ••••••••••••
```

Klicke auf **"Speichern"**, um das Secret zu verschlüsseln und zu speichern.

## ENV-Gruppen für Projekte

ENV-Gruppen ermöglichen es dir, mehrere Umgebungsvariablen zusammen zu verwalten:

**<SCREENSHOT: ENV-Gruppen-Editor>**

### Eine ENV-Gruppe erstellen

1. Klicke auf **"Neuer Eintrag"** → **"ENV-Gruppe"**
2. Benenne deine Gruppe (z.B. "Produktions-API")
3. Füge Variablen hinzu:

```env
API_KEY=sk_live_abc123xyz
DATABASE_URL=postgresql://user:pass@localhost:5432/db
REDIS_HOST=redis.example.com
STRIPE_SECRET=sk_test_def456
```

4. Klicke auf **"Speichern"**

## .env-Dateien auf Server deployen

Eine der mächtigsten Funktionen des Vaults: **Ein-Klick ENV-Deployment**.

**<SCREENSHOT: ENV-Upload-Dialog>**

1. Rechtsklick auf eine ENV-Gruppe
2. Wähle **"Auf Server hochladen"**
3. Wähle:
   - **Ziel-Verbindung** (dein SSH-Server)
   - **Remote-Pfad** (z.B. `/var/www/app/.env`)
4. Klicke auf **"Deployen"**

✅ Deine `.env`-Datei ist jetzt sicher hochgeladen!

### Use Case: Deployment auf mehrere Umgebungen

Erstelle separate ENV-Gruppen für jede Umgebung:

- `Produktions-API` → Deploy auf `/var/www/prod/.env`
- `Staging-API` → Deploy auf `/var/www/staging/.env`
- `Entwicklungs-API` → Deploy auf `/home/dev/app/.env`

Ein Klick deployed die korrekten Variablen in jede Umgebung.

## Vault-Variablen in Verbindungen verwenden

Du kannst Vault-Secrets in deinen SSH-Verbindungen referenzieren:

**<SCREENSHOT: Vault-Variable in Verbindung verwenden>**

Beim Erstellen einer Verbindung nutze den **"Aus Vault"**-Button, um ein Secret einzufügen statt es direkt einzutippen.

## Sicherheit

- Alle Vault-Daten sind mit **AES-256-GCM** verschlüsselt
- Master-Passwort wird niemals gespeichert
- Vault-Datenbank ist lokal gespeichert:
  - **macOS**: `~/Library/Application Support/OwnShell/vault.db`
  - **Windows**: `%APPDATA%/OwnShell/vault.db`
  - **Linux**: `~/.config/OwnShell/vault.db`

### Master-Passwort ändern

1. Gehe zu **Einstellungen** → **Sicherheit**
2. Klicke auf **"Master-Passwort ändern"**
3. Gib altes und neues Passwort ein
4. Der gesamte Vault wird mit dem neuen Passwort neu verschlüsselt

## Vault sichern

::: warning Wichtig
Sichere deinen Vault immer vor wichtigen Updates!
:::

Siehe [Backup & Restore](/de/advanced/backup-restore) für detaillierte Anleitungen.

## Best Practices

✅ **MACHE:**

- Nutze starke Master-Passwörter (16+ Zeichen)
- Organisiere Secrets mit klaren Namenskonventionen
- Sichere deinen Vault regelmäßig
- Nutze ENV-Gruppen für zusammenhängende Variablen

❌ **MACHE NICHT:**

- Master-Passwort teilen
- Master-Passwort in Klartext speichern
- Vault-Backups in Git committen (sie sind verschlüsselt, aber dennoch sensibel)
