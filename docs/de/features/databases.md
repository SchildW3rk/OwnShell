# Datenbanken

Der Tab **Datenbank** verbindet sich mit **PostgreSQL**, **MySQL**, **SQLite**, **Redis** und **MongoDB**.

![Datenbank-Explorer mit Tabellenansicht und Abfragekonsole](/screenshots/database.png)

## Verbindungen

- Fülle Host, Port, Benutzer, Passwort und Datenbank aus oder füge eine Verbindungs-URI ein (`postgres://`, `postgresql://`, `mysql://`, `redis://`, `rediss://`, `mongodb://`, `mongodb+srv://`).
- Passwörter werden mit deinem Master-Passwort verschlüsselt.
- **SSL** hat pro Verbindung drei Modi:
  - **Aus**.
  - **Erforderlich (Zertifikat prüfen)**: verschlüsselt und prüft Server-Zertifikat und Hostnamen. Das ist der Standard, wenn du SSL einschaltest.
  - **Erforderlich, nicht prüfen**: verschlüsselt, akzeptiert aber jedes Zertifikat. Wird mit einer Warnung markiert, weil sich jemand zwischen dir und dem Server als dieser ausgeben könnte.
- Optional hinterlegst du ein **CA-Zertifikat** (PEM einfügen oder Datei wählen) für Server mit privater CA. Es wird verschlüsselt gespeichert; die App zeigt nur, dass eine CA gesetzt ist, und ihren Fingerprint.
- Über einen SSH-Host wird das Zertifikat gegen den Hostnamen der Datenbank geprüft, nicht gegen die lokale Tunnel-Adresse.
- MySQL kann das Zertifikat nur gegen einen Hostnamen prüfen. Mit einer IP-Adresse als Host (auch über einen SSH-Host) wähle **Erforderlich, nicht prüfen** oder trage den Namen aus dem Zertifikat ein.
- PostgreSQL- und MySQL-Verbindungen, die vor diesen Modi mit SSL gespeichert wurden, haben das Zertifikat nie geprüft. Sie funktionieren weiter als **Erforderlich, nicht prüfen** und zeigen einmalig einen Hinweis, damit du sie umstellen kannst.

### SQLite-Dateien

Wähle eine lokale Datei oder eine Datei auf einem gespeicherten SSH-Host (per SFTP durchsuchen oder Pfad eintippen). Eine entfernte Datei wird in einen privaten temporären Ordner heruntergeladen und **schreibgeschützt** geöffnet; die Kopie wird beim Trennen gelöscht. Änderungen werden nie auf den Server zurückgeschrieben.

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

- PostgreSQL: Datenbanken, Schemas und Tabellen erstellen und löschen.
- PostgreSQL, MySQL und SQLite: Der Dialog zum Erstellen von Tabellen umfasst Name, Typ (je Engine), Länge, Nullable, Primärschlüssel, Standardwert und Unique. Standardwerte wie `NULL`, `CURRENT_TIMESTAMP`, `NOW()` und Zahlen werden direkt übernommen, alles andere als Text gespeichert.
- Lege Datenbankbenutzer mit Zugriffsstufen (Login, Lesen, Lesen/Schreiben, Admin) für PostgreSQL, MySQL, MongoDB und Redis an.
- Bestehende Tabellen lassen sich in OwnShell nicht ändern.

## Import und Export

Datenbank-Dumps nutzen die offiziellen Werkzeuge:

| Engine | Werkzeuge |
| --- | --- |
| PostgreSQL | `pg_dump`, `psql` |
| MySQL | `mysqldump`, `mysql` |
| MongoDB | `mongodump`, `mongorestore` |
| Redis | `redis-cli --rdb` (nur Export) |
| SQLite | eingebaut, kein Werkzeug nötig |

- Export nach `.sql` oder `.sql.gz` (nur Schema, nur Daten, ausgewählte Tabellen und `pg_dump`-Optionen).
- Import von `.sql` / `.sql.gz`, optional nach dem Leeren oder Löschen bestehender Tabellen.
- SQLite exportiert einen SQL-Dump (wie `sqlite3 .dump`). Ein Import läuft in einer Transaktion, ein fehlgeschlagener Import lässt die Datenbank also unverändert.
- Redis exportiert einen RDB-Snapshot. Zum Wiederherstellen stoppst du Redis auf dem Server und ersetzt dessen `dump.rdb`; OwnShell importiert keine RDB-Dateien. `redis-cli` kann den Hostnamen des Servers nicht prüfen, deshalb braucht ein Redis-Export mit SSL den Modus **Erforderlich, nicht prüfen**.
- PostgreSQL-, MySQL- und Redis-Passwörter erreichen die Dump-Werkzeuge über stdin und Umgebungsvariablen, nie über die Kommandozeile – andere Nutzer auf dem Server können sie also nicht mit `ps` mitlesen.
- PostgreSQL-, MySQL- und Redis-Dumps nutzen den SSL-Modus und das CA-Zertifikat der Verbindung. Prüfen ohne CA nutzt bei PostgreSQL-Werkzeugen ab Version 16 den System-Zertifikatsspeicher; MySQL-Werkzeuge brauchen zum Prüfen das CA-Zertifikat. Im Docker-Modus laufen die Werkzeuge im Container (`docker exec`), erreichen die Datenbank über dessen Loopback und behalten ihre Standards; der Port muss der sein, auf dem die Datenbank im Container lauscht.
- Bei Verbindungen über einen SSH-Host laufen die Werkzeuge **auf dem Server** und der Dump wird zu deinem Mac gestreamt, daher müssen sie dort installiert sein. Bei direkten Verbindungen müssen sie auf deinem Mac installiert sein. OwnShell sagt dir, welches Werkzeug fehlt.

## Redis

Durchsuche Keys mit einem Muster (`SCAN`) und filtere nach Typ (String, Hash, List, Set, Sorted Set). Zeige Werte an und bearbeite sie, benenne Keys um, setze oder entferne eine TTL und lösche Keys. Server-Infos und Datenbankstatistiken sind verfügbar. Der Browser nutzt Datenbank 0.

## MongoDB

Durchsuche Collections (erstellen und löschen), filtere Dokumente mit einer JSON-Abfrage, blättere durch die Ergebnisse und füge Dokumente in einem JSON-Editor ein, bearbeite oder lösche sie.

Führe **Aggregation-Pipelines** auf einer Collection aus: ein JSON-Array aus Stages. Extended JSON wie `{"$oid": "…"}` oder `{"$date": "…"}` wird unterstützt. Bis zu 500 Ergebnisse werden angezeigt. Bei Read-only-Verbindungen sind Pipelines mit `$out` oder `$merge` blockiert.

## Externe CLI

Bei direkten Verbindungen öffnest du `psql`, `mysql`, `mongosh`, `redis-cli` oder `sqlite3` in einem lokalen Terminal mit bereits ausgefüllten Verbindungsdaten.
