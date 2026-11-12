# Dateien: SFTP & S3

## SFTP

Der Tab **Dateien** einer Sitzung zeigt links deinen Mac und rechts den Server. *Nur SFTP*-Hosts öffnen denselben zweigeteilten Browser eigenständig.

![Zweigeteilter SFTP-Browser](/screenshots/sftp.png)

- **Ziehe** Dateien zwischen den Panels, um sie hoch- oder herunterzuladen. Im Dateien-Tab einer Sitzung lädst du Ordner einzeln hoch; der eigenständige SFTP-Browser lädt ganze Ordner hoch.
- Rechtsklick: **Herunterladen**, **Zum anderen Panel kopieren**, **Bearbeiten**, **Umbenennen**, **Berechtigungen bearbeiten**, **Löschen**.
- Werkzeugleiste: **Aktualisieren**, **Hochladen**, **Neue Datei**, **Neuer Ordner**.
- **Berechtigungen bearbeiten** zeigt Checkboxen für Besitzer/Gruppe/Andere mit einer Live-Vorschau des Oktalwerts.

::: warning
Vorhandene Dateien mit gleichem Namen werden ohne Nachfrage überschrieben.
:::

### Transfer-Warteschlange

Übertragungen laufen in einer Warteschlange, 3 gleichzeitig. Jede Übertragung lässt sich pausieren, fortsetzen oder abbrechen, und alle Übertragungen eines Hosts können auf einmal abgebrochen werden. Eine fortgesetzte Übertragung beginnt die Datei wieder von vorn.

### Editor

Doppelklicke auf eine Textdatei (bekannte Endungen, Dotfiles, `Dockerfile`, `Makefile`, `Caddyfile`), um sie im integrierten Editor mit Syntax-Highlighting zu öffnen. ⌘S speichert zurück auf den Server, Esc schließt. Dateien bis 10 MB lassen sich bearbeiten; andere Dateien werden heruntergeladen.

## S3 und S3-kompatibler Speicher

Lege eine S3-Verbindung mit **Endpoint-URL**, **Region**, **Access Key ID**, **Secret Access Key** und einem optionalen **Standard-Bucket** an. Die Schlüssel werden verschlüsselt. Mit **Verbindung testen** prüfst du die Verbindung.

- Funktioniert mit AWS S3 und S3-kompatiblen Diensten wie MinIO. Für Endpoints außerhalb von `amazonaws.com` nutzt OwnShell automatisch Path-Style-URLs.
- Durchsuche Buckets und Präfixe mit Paging. Fahre mit der Maus über ein Bild, um eine Vorschau zu sehen.
- Wähle Objekte aus und **lösche** sie (nach einer Bestätigung).
- Doppelklicke auf eine Datei oder nutze **Öffnen** / **URL kopieren**, um einen **vorsignierten Link** zu erhalten, der 1 Stunde gültig ist.

Der S3-Browser von OwnShell lädt keine Objekte hoch, benennt sie nicht um und kopiert sie nicht.

### CORS-Editor

Öffne die CORS-Einstellungen eines Buckets, um Regeln hinzuzufügen, zu bearbeiten oder zu löschen oder die gesamte Konfiguration zu entfernen. Jede Regel hat erlaubte Origins (`*` erlaubt), Methoden (GET, PUT, POST, DELETE, HEAD), erlaubte Header, Expose-Header und Max-Age (0–86400 Sekunden). Bis zu 100 Regeln pro Bucket.
