# API-Client

<!-- v-pre: {{…}} in this page is OwnShell variable syntax, not Vue interpolation -->
:::: v-pre

Der API-Client sendet HTTP-, GraphQL-, WebSocket- und Server-Sent-Events-Requests direkt aus OwnShell. Requests können **direkt** von deinem Mac oder **über einen deiner SSH-Hosts** laufen, sodass du interne APIs aufrufen kannst, die nur von einem Server aus erreichbar sind.

![API-Client mit Request-Editor und JSON-Antwort](/screenshots/api-client.png)

## Requests und Ordner

Requests liegen in Ordnern in der Seitenleiste. Ordner lassen sich verschachteln; der oberste Ordner ist die **Collection**.

- **Neue Anfrage** / **Neuer Ordner** über die Seitenleiste oder das Kontextmenü eines Ordners. Umbenennen, duplizieren (`<name> (Copy)`), nach oben/unten verschieben, nach Name sortieren und löschen im selben Menü.
- Das Filterfeld durchsucht Name, Methode oder URL. Esc leert es.
- Methoden: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS.
- Der Editor hat die Bereiche **Parameter**, **Auth**, **Header**, **Body**, **Variablen**, **Tests** und **Einstellungen**. Badges zeigen, was ausgefüllt ist.
- **Parameter** werden an eine bereits in der URL vorhandene Query angehängt; die Kodierung der URL selbst bleibt wie eingetippt. Nur aktivierte Zeilen mit einem Key werden gesendet.
- Header- und Parameter-Zeilen lassen sich einzeln umschalten, mit den Sammelaktionen **Alle aktivieren**, **Alle deaktivieren** und **Deaktivierte löschen**.
- Wechsle zwischen horizontalem und vertikalem Layout; die Panels sind in der Größe veränderbar.

**Beim Senden wird der Request immer zuerst gespeichert.** Du kannst auch mit ⌘S speichern. Mehrere Requests können gleichzeitig laufen.

## Body-Typen

| Body-Typ | Gesendeter Content-Type (sofern du keinen setzt) |
| --- | --- |
| Keine | – |
| JSON | `application/json` |
| Form Data (multipart) | `multipart/form-data` mit generierter Boundary (immer von OwnShell gesetzt) |
| x-www-form-urlencoded | `application/x-www-form-urlencoded` |
| Raw (Text, JSON, XML, HTML) | `text/plain`, `application/json`, `application/xml`, `text/html` |
| Binary | aus der Dateiendung abgeleitet, sonst `application/octet-stream` |
| GraphQL | `application/json`, immer als POST gesendet |

- GET- und HEAD-Requests senden nie einen Body.
- Form-Data-Felder sind **Text** oder **Datei**. Dateien müssen im Dateidialog von OwnShell ausgewählt werden; bei importierten Requests wählst du ihre Dateien erneut aus.
- Request- und Response-Bodys sind auf **50 MB** begrenzt. Komprimierte Antworten (gzip, deflate, brotli) werden dekodiert, ebenfalls bis 50 MB.

## Antwortansicht

- **Body**: JSON wird formatiert dargestellt; ein **Raw**-Schalter zeigt den Originaltext. Bilder (PNG, JPEG, GIF, WebP) werden inline angezeigt. Andere binäre Antworten lassen sich speichern.
- **Header**, **Zeiten** (Vorbereitung, bis zu den Headern, Body-Download, gesamt), Status und Größe.
- **Vorschau** rendert HTML-Antworten in einem Sandbox-Frame.
- **Kopieren** und **Speichern** des Bodys.

## Authentifizierung

| Typ | Was gesendet wird |
| --- | --- |
| Keine Auth | nichts |
| Bearer-Token | `Authorization: Bearer <token>` |
| Basic Auth | `Authorization: Basic base64(user:password)` |
| API-Key | ein Header oder Query-Parameter, den du benennst |
| OAuth 2.0 | `Authorization: <prefix> <token>` (Präfix standardmäßig `Bearer`) |
| Erben | die Auth des nächstgelegenen übergeordneten Ordners |

### Vererbung

Lege die Auth für einen Ordner über **Authentifizierung** in seinem Kontextmenü fest. Requests und Unterordner, die auf **Erben** stehen, gehen die Ordnerkette nach oben und nutzen die erste Auth, die nicht *Erben* ist. Ein Request auf oberster Ebene mit *Erben* sendet keine Auth. Neue Ordner stehen standardmäßig auf *Erben*, neue Requests auf *Keine Auth*.

### OAuth 2.0

Zwei Grants werden unterstützt: **Client Credentials** und **Authorization Code (PKCE)**. Felder: Token-URL, Autorisierungs-URL, Client-ID, Client-Secret, Scopes (durch Leerzeichen getrennt), Audience, Client-Authentifizierung (Basic-Auth-Header oder Request-Body) und Header-Präfix.

- Klicke auf **Neues Token abrufen**, um ein Token zu holen. Bei Authorization Code öffnet OwnShell die Autorisierungsseite in deinem **Standardbrowser** und wartet bis zu 5 Minuten auf die Weiterleitung an eine einmalige Loopback-Adresse `http://127.0.0.1:<random port>/callback`. Registriere dieses Muster als Redirect-URI bei deinem Anbieter. PKCE nutzt S256 und einen zufälligen `state`.
- Beim Senden wird nie der Browser geöffnet. Ohne gültiges Token schlägt das Senden fehl und fordert dich auf, **Neues Token abrufen** zu nutzen.
- Ein Token wird bis 30 Sekunden vor seinem Ablauf wiederverwendet und dann mit dem Refresh-Token erneuert. Schlägt das fehl, läuft ein neuer Grant (Client Credentials) oder du wirst aufgefordert, ein neues Token zu holen.
- Token- und Autorisierungs-URLs müssen `https` nutzen (einfaches `http` nur für `localhost`, `127.x.x.x` und `[::1]`). Token-Requests laufen immer **direkt von deinem Mac**, nie über einen SSH-Host, mit aktiver TLS-Prüfung.
- Der Request muss gespeichert sein, bevor du ein Token holen kannst. **Token löschen** löscht das zwischengespeicherte Token.
- Mit *Erben* wird das Token am Ordner zwischengespeichert und von seinen Requests geteilt.

::: tip Was verschlüsselt wird
Das OAuth-Client-Secret, Bearer-Tokens, Basic-Passwörter, API-Key-Werte sowie OAuth-Access- und Refresh-Tokens werden mit deinem Master-Passwort verschlüsselt und nie wieder angezeigt: Das Feld zeigt, dass ein Wert gespeichert ist. Lass es leer, um ihn zu behalten, tippe einen neuen Wert ein, um ihn zu ersetzen, oder nutze **Gespeichertes Secret entfernen**. Ein Wert, der nur auf Variablen verweist, etwa `{{TOKEN}}`, enthält selbst kein Secret und bleibt sichtbar. Von älteren Versionen gespeicherte Werte werden verschlüsselt, sobald du den API-Client nach dem Entsperren zum ersten Mal öffnest.
:::

## Variablen

Nutze `{{name}}` in URL, Parametern, Headern, Body und Auth-Feldern. Das Tippen von `{{` öffnet die Autovervollständigung.

### Geltungsbereiche und Rangfolge

Von der höchsten zur niedrigsten:

1. **Laufzeit**: Werte, die während eines Collection-Laufs übernommen wurden
2. **Request**-Variablen (Bereich Variablen)
3. **Ordner**-Variablen, nächstgelegener Ordner zuerst
4. **Collection**-Variablen (oberster Ordner)
5. **Umgebung**: die für den Request ausgewählte Vault-Umgebung
6. **Globale** Variablen

Ordner-, Collection- und globale Variablen bearbeitest du über **Variablen …** in den Menüs der Seitenleiste. Ordner- und globale Variablen lassen sich als **geheim** markieren: Der Wert wird verschlüsselt gespeichert und nie wieder angezeigt. Request-Variablen sind Klartext. Werte aus Vault-Umgebungen sind immer verschlüsselt (siehe [Vault & Umgebungen](/de/features/vault)).

Eine unbekannte Variable stoppt den Request, bevor etwas gesendet wird, und listet die durchsuchten Geltungsbereiche auf.

### Integrierte Variablen

| Variable | Wert |
| --- | --- |
| `{{$uuid}}` | eine zufällige UUID v4 |
| `{{$timestamp}}` | Unix-Zeit in Sekunden |
| `{{$isoTimestamp}}` | aktuelle Zeit im ISO-8601-Format |

Die Zeit wird einmal pro Request ermittelt, daher hat jedes `$timestamp` in einem Request denselben Wert.

## Senden über einen SSH-Host

Jeder Request hat eine Routenauswahl: **Direkt** oder einer deiner SSH-Hosts. Ist ein Host ausgewählt, öffnet OwnShell einen SSH-Kanal (wie `ssh -W`) von diesem Host zum Ziel.

- Hostnamen werden **auf der Serverseite** aufgelöst, sodass interne Namen und private Adressen so funktionieren, wie der Host sie sieht.
- HTTPS ist Ende-zu-Ende zwischen OwnShell und dem Ziel verschlüsselt; der SSH-Host leitet nur Bytes weiter.
- HTTP, HTTPS, WebSocket und SSE funktionieren alle über den Host. Eine bestehende SSH-Sitzung zum Host wird wiederverwendet.
- Ein gerouteter Request fällt nie auf direkt zurück. Weiterleitungen werden nur zum selben Host und Port verfolgt.
- Kann der Host das Ziel nicht erreichen, wird der Request nicht gesendet und du siehst einen Fehler.

## Request-Einstellungen

Der Bereich **Einstellungen** gilt für den aktuellen Request:

| Einstellung | Standard | Hinweise |
| --- | --- | --- |
| Timeout | 30 s | 1–600 s für den gesamten Request, inklusive Weiterleitungen und Body. Bei SSE deckt es die Zeit bis zu den Headern ab und wirkt danach als Leerlauf-Timeout. |
| Weiterleitungen folgen | an | Bis zu 10 Weiterleitungen. Zugangsdaten (Authorization, Cookie, API-Keys) werden entfernt, wenn eine Weiterleitung zu einem anderen Origin führt. |
| TLS-Zertifikate prüfen | an | Wenn aus, zeigt der Request die Warnung „TLS ungeprüft“. |
| Cookie-Jar verwenden | an | Cookies für diesen Request senden und speichern. |

## Import und Export

### curl

- **curl importieren** über die Seitenleiste, oder füge einen Befehl, der mit `curl ` beginnt, in das URL-Feld ein. Unterstützte Optionen sind unter anderem `-X`, `-H`, `-A`, `-e`, `-b`, `-u`, `--oauth2-bearer`, `-d`/`--data*`, `--json`, `-F`, `--form-string`, `-G`, `-I`, `-k`, `-L`, `-m` und `--url`. Ignorierte Optionen werden nach dem Import aufgelistet.
- **Als curl kopieren (Variablen als Platzhalter)** behält Secrets und Credential-Header als `{{…}}`. **Als curl kopieren (Variablen aufgelöst)** fügt nach einer Bestätigung die echten Werte ein. OAuth-Tokens werden immer als `{{oauthAccessToken}}` exportiert.

### Postman

**Postman importieren …** liest Postman-Collections v2.0 und v2.1 sowie Postman-Umgebungen (bis 20 MB und 10.000 Einträge).

- Bearer, Basic, API-Key, No-Auth und Inherit werden übernommen. Andere Auth-Typen (inklusive Postmans OAuth 2.0) werden mit einer Warnung zu *Keine Auth*.
- Raw-, urlencoded-, Form-Data-, Datei- und GraphQL-Bodys werden übernommen. Datei-Teile behalten nur den Dateinamen; wähle die Dateien erneut aus.
- Collection- und Ordnervariablen werden importiert; geheime Postman-Variablen werden zu geheimen Variablen. `{{$guid}}` und `{{$randomUUID}}` werden zu `{{$uuid}}`.
- Eine Umgebungsdatei wird zu einer Vault-Umgebung.
- Skripte werden nicht importiert; du bekommst eine Warnung.

Jeder Import erstellt einen neuen Ordner auf oberster Ebene. Nichts Bestehendes wird überschrieben.

### OwnShell-Dateien (`.ownshell-api.json`)

**Als OwnShell-Datei exportieren …** schreibt einen Ordner in eine lesbare JSON-Datei, die du in Git committen kannst; **OwnShell-Datei importieren …** liest sie wieder ein.

```json
{
  "format": "ownshell-api",
  "version": 1,
  "folder": {
    "name": "Billing API",
    "auth": { "type": "inherit", "config": {} },
    "variables": [{ "key": "baseUrl", "value": "https://api.example.com", "enabled": true, "secret": false }],
    "folders": [],
    "requests": [
      {
        "name": "List invoices",
        "method": "GET",
        "url": "{{baseUrl}}/invoices",
        "params": [], "headers": [],
        "body": { "type": "none" },
        "auth": { "type": "inherit", "config": {} },
        "settings": { "timeoutSeconds": null, "followRedirects": null, "verifyTls": null }
      }
    ]
  }
}
```

Der Export ist deterministisch (feste Key-Reihenfolge, Reihenfolge der Seitenleiste, Einrückung mit 2 Leerzeichen), sodass Diffs klein bleiben. Er **lässt Secrets weg**: Werte geheimer Variablen sind leer, das OAuth-Client-Secret wird nie geschrieben, und Bearer-/Basic-/API-Key-Werte sowie sensible Header werden zu `{{placeholders}}`. Der ausgewählte SSH-Host, die Umgebung und die Cookie-Jar-Einstellung sind nicht Teil der Datei. Dateien einer neueren Haupt-Formatversion werden abgelehnt.

## Verlauf

Das Panel **Verlauf** behält die letzten 200 Sendevorgänge (inklusive WebSocket-Verbindungen): Methode, URL-Vorlage, Status, Dauer und Größe. Es speichert **keine Bodys, Header oder aufgelösten Werte**; Zugangsdaten in URLs werden geschwärzt. Klicke auf einen Eintrag, um den gespeicherten Request zu öffnen, oder klicke mit rechts, um aus seiner URL einen neuen Request zu erstellen. **Verlauf leeren** lässt gespeicherte Requests unberührt.

## Cookies

OwnShell hat einen Cookie-Jar für den Workspace. Cookies aus Antworten werden nach RFC 6265 gespeichert und gesendet (Domain- und Pfad-Abgleich, `Secure` nur über HTTPS, Public-Suffix-Domains werden abgelehnt).

- Werte werden verschlüsselt und nie angezeigt, exportiert oder gesichert.
- Bis zu 50 Cookies pro Domain und 3000 insgesamt; die ältesten werden zuerst verworfen.
- Der Dialog **Cookies** listet Domain, Pfad, Name und Flags und lässt dich einzelne Cookies löschen oder alle leeren.
- Schalte den Jar pro Request in den **Einstellungen** aus.

## GraphQL

Wähle den Body-Typ **GraphQL**, um einen Query-Editor, **Variablen (JSON)** und einen optionalen Operationsnamen zu bekommen. Variablen dürfen `{{…}}` enthalten; das Ergebnis muss gültiges JSON sein. **Schema abrufen** führt eine Introspection-Query aus (über dieselbe Route und Auth wie der Request) und zeigt eine durchsuchbare Liste von Typen und Feldern.

## WebSocket

Stelle einen Request im Menü der URL-Leiste auf **WebSocket** um und verbinde dich dann.

![WebSocket-Sitzung mit gesendeten und empfangenen Nachrichten](/screenshots/api-websocket.png)

- Nutzt dieselbe Auth, dieselben Variablen, Cookies, TLS-Einstellung und SSH-Route wie HTTP-Requests. Der Timeout gilt für den Handshake.
- Sende **Text**-Nachrichten mit ⌘↩ aus dem Eingabefeld; **JSON formatieren** räumt die Nachricht auf. Empfangene Binärnachrichten erscheinen als Platzhalter mit ihrer Größe.
- Nachrichten bis 4 MB. Das Log behält die letzten 1000 Nachrichten (oder rund 5 Millionen Zeichen).
- Keine Komprimierung und keine Subprotokolle.

## Server-Sent Events

Eine Antwort mit `Content-Type: text/event-stream` wird live als Liste von Events gestreamt (Event-Name, Daten, ID, Zeit). Events bis 1 MB; die Ansicht behält die letzten 1000 Events (oder rund 5 Millionen Zeichen). Es gibt kein automatisches Wiederverbinden. Der Stream endet mit *Stream beendet*, *Stream gestoppt* oder *Stream ohne Daten (Timeout)*.

## Collection-Runner und Tests

**Ordner ausführen** führt jeden gespeicherten Request in einem Ordner nacheinander aus (Unterordner zuerst, in der Reihenfolge der Seitenleiste), bis zu 500 Requests. Nicht gespeicherte Änderungen werden nicht berücksichtigt und WebSocket-Requests übersprungen. Aktiviere **Beim ersten Fehler anhalten**, um früh zu stoppen.

### Assertions

Füge im Bereich **Tests** eines Requests Prüfungen hinzu (bis zu 100 pro Request):

| Assertion | Beispiel |
| --- | --- |
| Status ist | `200, 201` |
| Status im Bereich | `200-299` |
| Header vorhanden | `content-type` |
| Header ist gleich | `content-type` = `application/json` |
| JSON-Wert ist gleich | `$.data.status` = `"paid"` |
| JSON-Wert vorhanden | `$.items[0].id` |
| JSON-Wert enthält | `$.message` enthält `ok` |
| Antwortzeit unter (ms) | `500` |

JSON-Pfade lassen sich als `$.items[0].name`, `items[0]["key"]` oder `data.0.id` schreiben. Ein Request ohne Assertions gilt als bestanden, wenn er eine Antwort bekommt.

### Übernahmen

Eine Übernahme speichert einen JSON-Wert aus der Antwort in einer Laufzeitvariable, zum Beispiel `token` aus `$.access_token`. Spätere Requests im selben Lauf können `{{token}}` nutzen; Laufzeitvariablen haben Vorrang vor allen anderen Geltungsbereichen. Übernommene Werte liegen nur für den Lauf im Speicher.

Der Lauf-Bericht zeigt pro Request Status, Zeit, Assertion-Ergebnisse mit tatsächlichen Werten und übernommene Variablen, dazu eine Zusammenfassung. Ergebnisse werden nicht gespeichert.

## Tastenkürzel

Diese funktionieren, solange der API-Client den Fokus hat und kein Menü oder Dialog geöffnet ist.

| Kürzel | Aktion |
| --- | --- |
| ⌘↩ | Senden (Verbinden bei WebSocket) |
| ↩ im URL-Feld | Senden |
| ⌘S | Speichern |
| Esc | Laufenden Request abbrechen (Trennen bei WebSocket) |
| ⌘↩ im WebSocket-Eingabefeld | Nachricht senden |
| ↑ / ↓, ↩ oder Tab, Esc | Variablen-Autovervollständigung bewegen, auswählen oder schließen |

::::
