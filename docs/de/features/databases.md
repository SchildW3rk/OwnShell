# Datenbanken

Der Tab **Datenbank** verbindet sich mit **PostgreSQL**, **MySQL**, **SQLite**, **Redis** und **MongoDB**.

![Datenbank-Explorer mit Tabellenansicht und Abfragekonsole](/screenshots/database.png)

## Verbindungen

- Fülle Host, Port, Benutzer, Passwort und Datenbank aus oder füge eine Verbindungs-URI ein (`postgres://`, `postgresql://`, `mysql://`, `redis://`, `rediss://`, `mongodb://`, `mongodb+srv://`).
- Passwörter werden mit deinem Master-Passwort verschlüsselt.
- **SSL** ist ein einzelner Schalter. Bei PostgreSQL und MySQL verschlüsselt er die Verbindung, **prüft aber das Server-Zertifikat nicht**.

### Über einen SSH-Host

Wähle einen gespeicherten SSH-Host, und OwnShell leitet einen lokalen Port auf `127.0.0.1` über diesen Host zur Datenbank weiter (inklusive Jump-Hosts). Du kannst dich auch mit einer Datenbank verbinden, die in einem Docker-Container auf dem Host läuft: OwnShell ermittelt die Adresse des Containers mit `docker inspect`. Die SSH-Verbindung wird geschlossen, wenn die letzte Datenbankverbindung, die sie nutzt, getrennt wird.

### Read-only-Modus

Schalte **Read-only** pro Verbindung ein, um Produktivdaten zu schützen:

- **SQL**: Nur `SELECT`-, `WITH`-, `SHOW`-, `DESCRIBE`- und `EXPLAIN`-Anweisungen laufen, und nur ohne schreibende Schlüsselwörter. PostgreSQL und MySQL führen sie zusätzlich in einer Read-only-Transaktion aus; SQLite-Dateien werden schreibgeschützt geöffnet.
- Zeilen bearbeiten, einfügen und löschen, Schemaänderungen und Importe sind blockiert.
- **MongoDB**: Schreibvorgänge auf Dokumente und Collections sind blockiert; Aggregationen mit `$out` oder `$merge` sind blockiert.
- **Redis**: Alle Schreiboperationen sind blockiert.
- Exporte funktionieren weiterhin.

## Tabellen und Abfragen

- Durchsuche Tabellen in einer seitenweisen Ansicht. Doppelklicke auf eine Zelle, um sie zu bearbeiten. Zeilen lassen sich löschen, wenn die Tabelle einen Primärschlüssel hat.
- Die Abfragekonsole hat Syntax-Highlighting und Vervollständigung von Tabellennamen. **⌘↩** führt den gesamten Editorinhalt aus.
- Der **Abfrageverlauf** wird pro Verbindung gespeichert (bis zu 100 Einträge), inklusive fehlgeschlagener Abfragen, mit Zeit und Zeilenanzahl. Passwörter, Tokens, Schlüssel und Zugangsdaten in Verbindungs-URIs werden vor dem Speichern geschwärzt. Du kannst ihn pro Verbindung leeren.

## Schema-Werkzeuge

- PostgreSQL: Datenbanken, Schemas und Tabellen erstellen und löschen. Der Dialog zum Erstellen von Tabellen umfasst Name, Typ, Länge, Nullable, Primärschlüssel, Standardwert und Unique.
- Lege Datenbankbenutzer mit Zugriffsstufen (Login, Lesen, Lesen/Schreiben, Admin) für PostgreSQL, MySQL, MongoDB und Redis an.
- Bestehende Tabellen lassen sich in OwnShell nicht ändern.

## Import und Export

Datenbank-Dumps nutzen die offiziellen Werkzeuge:

| Engine | Werkzeuge |
| --- | --- |
| PostgreSQL | `pg_dump`, `psql` |
| MySQL | `mysqldump`, `mysql` |
| MongoDB | `mongodump`, `mongorestore` |
| Redis | `redis-cli --rdb` |

- Export nach `.sql` oder `.sql.gz` (nur Schema, nur Daten, ausgewählte Tabellen und `pg_dump`-Optionen).
- Import von `.sql` / `.sql.gz`, optional nach dem Leeren oder Löschen bestehender Tabellen.
- Bei Verbindungen über einen SSH-Host laufen die Werkzeuge **auf dem Server** und der Dump wird zu deinem Mac gestreamt, daher müssen sie dort installiert sein. Bei direkten Verbindungen müssen sie auf deinem Mac installiert sein. OwnShell sagt dir, welches Werkzeug fehlt.

## Redis

Durchsuche Keys mit einem Muster (`SCAN`) und filtere nach Typ (String, Hash, List, Set, Sorted Set). Zeige Werte an und bearbeite sie, benenne Keys um, setze oder entferne eine TTL und lösche Keys. Server-Infos und Datenbankstatistiken sind verfügbar. Der Browser nutzt Datenbank 0.

## MongoDB

Durchsuche Collections (erstellen und löschen), filtere Dokumente mit einer JSON-Abfrage, blättere durch die Ergebnisse und füge Dokumente in einem JSON-Editor ein, bearbeite oder lösche sie.

## Externe CLI

Bei direkten Verbindungen öffnest du `psql`, `mysql`, `mongosh`, `redis-cli` oder `sqlite3` in einem lokalen Terminal mit bereits ausgefüllten Verbindungsdaten.
