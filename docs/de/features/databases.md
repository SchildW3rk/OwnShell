# Datenbank-Client

Verbinde dich mit MySQL, PostgreSQL, Redis, MongoDB und SQLite direkt aus OwnShell.

**<SCREENSHOT: Datenbank-Explorer-Interface>**

## Unterstützte Datenbanken

| Datenbank  | Version | Features                          |
| ---------- | ------- | --------------------------------- |
| MySQL      | 5.7+    | Query-Editor, Tabellen-Browser    |
| PostgreSQL | 10+     | Volle SQL-Unterstützung, Schemas  |
| Redis      | 5.0+    | Schlüssel-Browser, TTL-Verwaltung |
| MongoDB    | 4.0+    | Dokument-Browser, Aggregations    |
| SQLite     | 3.x     | Lokaler Datei-Browser             |

## Zu einer Datenbank verbinden

### PostgreSQL Beispiel

1. Öffne den **Datenbank**-Tab
2. Klicke auf **"Neue Verbindung"**
3. Fülle die Details aus:

**<SCREENSHOT: Neue DB-Verbindung Dialog>**

```
Typ: PostgreSQL
Host: localhost
Port: 5432
Datenbank: myapp_production
Benutzername: postgres
Passwort: ••••••••
```

4. Klicke auf **"Verbindung testen"**
5. **Speichern** um zur Verbindungsliste hinzuzufügen

## SQL-Abfragen ausführen

**<SCREENSHOT: SQL-Editor>**

```sql
SELECT * FROM users
WHERE created_at > '2026-01-01'
ORDER BY email;
```

### Editor-Features

- **Syntax-Highlighting** - Farbcodiertes SQL
- **Auto-Complete** - Tabellen- und Spalten-Vorschläge
- **Multi-Query** - Mehrere Abfragen getrennt durch `;`
- **Query-Historie** - Erfolgreiche und fehlgeschlagene Abfragen bei aktivierter Historie anzeigen
- **Ausführen per Tastatur** - Cmd/Strg + Enter führt die Abfrage wie der Ausführen-Button aus

Große Query-Ergebnisse behalten alle zurückgegebenen Zeilen in ihrer Query-Reihenfolge; gemountet werden nur sichtbare Zeilen und ein kleiner Scrollpuffer. Auch die letzte Ergebniszeile bleibt erreichbar. Eine neuere Ausführung besitzt Ergebnis-, Lade- und Fehlerzustand; ältere Antworten können sie nicht überschreiben.

## Redis Client

**<SCREENSHOT: Redis Schlüssel-Browser>**

- Zeige alle Schlüssel mit Pattern-Matching (`user:*`, `session:*`)
- Gruppiere nach Prefix
- Bearbeite verschiedene Datentypen (String, Hash, List, Set)
- TTL-Verwaltung

Die Suche verwendet `SCAN MATCH`, den gewählten Typfilter und den Hinweis `COUNT 100`, keine neue Ergebnisgrenze. **Mehr laden** setzt das abgesendete Pattern, den Typ und den Cursor fort. Änderungen am Suchentwurf gelten erst nach erneutem Absenden. Auch eine leere Trefferseite kann einen weiteren Cursor liefern; beendet ist die Suche bei Cursor `0`.

Die virtualisierte Liste behält die vollständige geladene Folge und Redis-Iterationsreihenfolge. `SCAN` ist kein Snapshot: Änderungen am Schlüsselbestand können doppelte oder veränderte Ergebnisse liefern. Beim Schlüsselwechsel können ältere Antworten weder Wert noch Lade- oder Fehlerzustand ersetzen. Vollständige Werte, Listenreihenfolge und TTL bleiben erhalten.

## MongoDB-Dokumente

Der Browser behält Seiten mit 50 Dokumenten, Filter und vollständige Dokumentinhalte. Ein Wechsel von Collection, Filter, Seite oder Auswahl entwertet ältere UI-Antworten, ohne bereits abgesendete Datenbankänderungen abzubrechen.

CodeMirror behält Dokument und Undo-Historie. Ein lokaler Worker formatiert den gewählten vollständigen JSON-Snapshot und prüft zusammengefasste inkrementelle Änderungen. Veraltete Ergebnisse ersetzen keine neuere Auswahl. Speichern liest und parst den aktuellen vollständigen Editorinhalt.

Snapshot-Antworten enthalten vollständiges normalisiertes JSON, ID und sämtliche obersten Feldnamen. Beim Öffnen gibt es weder eine neue Projektion noch ein zusätzliches Limit oder eine Folgeabfrage. Während der Formatierung bleibt der Editor im Ladezustand; Datentypen, Feldreihenfolge, Kopieren/Speichern und Schreibschutz bleiben erhalten.

## Verbindung über SSH-Tunnel

Verbinde dich mit Datenbanken über SSH-Tunnel:

**<SCREENSHOT: Datenbank via SSH-Tunnel>**

1. Aktiviere **"Über SSH verbinden"**
2. Wähle deine SSH-Verbindung
3. Gib Datenbank-Zugangsdaten ein
4. OwnShell erstellt den Tunnel automatisch

Perfekt für Datenbanken, die nur innerhalb eines privaten Netzwerks erreichbar sind.

## Best Practices

✅ **MACHE:**

- Nutze SSH-Tunnel für Remote-Datenbanken
- Speichere Zugangsdaten im Vault
- Nutze Read-Only User für Produktions-Abfragen
- Teste Abfragen erst auf Entwicklungssystem

❌ **MACHE NICHT:**

- `DROP` oder `DELETE` ohne WHERE-Klauseln ausführen
- Produktions-Passwörter in Verbindungseinstellungen speichern
- Große Tabellen ohne LIMIT abfragen
