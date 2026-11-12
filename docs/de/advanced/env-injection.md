# ENV Variable Deployment

Deploye Umgebungsvariablen (.env-Dateien) vom Vault auf deine Server mit einem Klick.

**<SCREENSHOT: ENV-Deployment-Dialog>**

## Übersicht

Statt manuell `.env`-Dateien auf Servern via SSH zu bearbeiten, kannst du mit OwnShell:

1. ENV-Variablen sicher im Vault speichern
2. Mit einem Klick auf mehrere Server deployen
3. Deine Umgebungs-Konfigurationen versionieren

## ENV-Gruppen einrichten

### ENV-Gruppe im Vault erstellen

1. Öffne **Vault**-Tab
2. Klicke auf **"Neuer Eintrag"** → **"ENV-Gruppe"**
3. Benenne deine Gruppe (z.B. "Produktions-API")
4. Füge Variablen hinzu:

```env
# Application
NODE_ENV=production
APP_PORT=3000
APP_URL=https://api.example.com

# Database
DATABASE_URL=postgresql://user:pass@db.example.com:5432/prod
REDIS_URL=redis://cache.example.com:6379

# External Services
STRIPE_SECRET_KEY=sk_live_abc123
AWS_ACCESS_KEY_ID=AKIA...
```

5. Klicke auf **"Speichern"**

## Auf Server deployen

### Schnell-Deploy

1. Rechtsklick auf ENV-Gruppe im Vault
2. Wähle **"Auf Server hochladen"**
3. Wähle Optionen:

```
Verbindung: Produktions-Server
Remote-Pfad: /var/www/api/.env
Existierende sichern: ✓ Ja
Service neustarten: ✓ Ja (pm2 restart api)
```

4. Klicke auf **"Deployen"**

✅ Fertig! Deine `.env`-Datei ist jetzt auf dem Server.

## Mehrere Umgebungen

Verwalte separate ENV-Gruppen für jede Umgebung:

**Produktions-API**

```env
NODE_ENV=production
DATABASE_URL=postgresql://prod-db:5432/api
```

**Staging-API**

```env
NODE_ENV=staging
DATABASE_URL=postgresql://staging-db:5432/api
```

**Entwicklungs-API**

```env
NODE_ENV=development
DATABASE_URL=postgresql://localhost:5432/api_dev
```

Deploye jede mit einem Klick auf den richtigen Server!

## Best Practices

✅ **MACHE:**

- Aktiviere immer Backups vor Deployment
- Nutze Template-Variablen für server-spezifische Werte
- Teste ENV-Änderungen erst auf Staging
- Setze restriktive Berechtigungen (600)

❌ **MACHE NICHT:**

- Auf Produktion deployen ohne Tests
- ENV-Gruppen in Git speichern (nur Vault nutzen)
- Produktions-ENV-Variablen teilen
- Services vergessen nach Deployment neu zu starten
