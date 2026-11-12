# API client

<!-- v-pre: {{…}} in this page is OwnShell variable syntax, not Vue interpolation -->
:::: v-pre

The API client sends HTTP, GraphQL, WebSocket and Server-Sent Events requests from inside OwnShell. Requests can go **directly** from your Mac or **through one of your SSH hosts**, so you can call internal APIs that are only reachable from a server.

![API client with a request editor and a JSON response](/screenshots/api-client.png)

## Requests and folders

Requests live in folders in the sidebar. Folders can be nested; the top-level folder is the **collection**.

- **New Request** / **New Folder** from the sidebar or a folder's context menu. Rename, duplicate (`<name> (Copy)`), move up/down, sort by name and delete from the same menu.
- The filter box matches name, method or URL. Esc clears it.
- Methods: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS.
- The editor has the sections **Params**, **Auth**, **Headers**, **Body**, **Variables**, **Tests** and **Settings**. Badges show what is filled in.
- **Params** are appended to any query already in the URL; the URL's own encoding is kept as typed. Only enabled rows with a key are sent.
- Header and param rows can be toggled one by one, with bulk **Enable All**, **Disable All** and **Delete Disabled**.
- Switch between a horizontal and a vertical layout; panels are resizable.

**Sending always saves the request first.** You can also save with ⌘S. Several requests can be in flight at the same time.

## Body types

| Body type | Content-Type sent (unless you set one) |
| --- | --- |
| None | – |
| JSON | `application/json` |
| Form Data (multipart) | `multipart/form-data` with a generated boundary (always set by OwnShell) |
| x-www-form-urlencoded | `application/x-www-form-urlencoded` |
| Raw (text, JSON, XML, HTML) | `text/plain`, `application/json`, `application/xml`, `text/html` |
| Binary | guessed from the file extension, otherwise `application/octet-stream` |
| GraphQL | `application/json`, always sent as POST |

- GET and HEAD requests never send a body.
- Form Data fields are **Text** or **File**. Files must be picked in OwnShell's file dialog; imported requests ask you to select their files again.
- Request and response bodies are limited to **50 MB**. Compressed responses (gzip, deflate, brotli) are decoded, also up to 50 MB.

## Response viewer

- **Body**: JSON is pretty-printed; a **Raw** toggle shows the original text. Images (PNG, JPEG, GIF, WebP) display inline. Other binary responses can be saved.
- **Headers**, **Timing** (prepare, until headers, body download, total), status and size.
- **Preview** renders HTML responses in a sandboxed frame.
- **Copy** and **Save** the body.

## Authentication

| Type | What is sent |
| --- | --- |
| No Auth | nothing |
| Bearer Token | `Authorization: Bearer <token>` |
| Basic Auth | `Authorization: Basic base64(user:password)` |
| API Key | a header or query parameter you name |
| OAuth 2.0 | `Authorization: <prefix> <token>` (prefix defaults to `Bearer`) |
| Inherit | the auth of the nearest parent folder |

### Inheritance

Set auth for a folder with **Authentication** in its context menu. Requests and sub-folders set to **Inherit** walk up the folder chain and use the first auth that is not *Inherit*. A top-level request set to *Inherit* sends no auth. New folders default to *Inherit*, new requests to *No Auth*.

### OAuth 2.0

Two grants are supported: **Client Credentials** and **Authorization Code (PKCE)**. Fields: token URL, authorization URL, client ID, client secret, scopes (space-separated), audience, client authentication (Basic auth header or request body) and header prefix.

- Click **Get new token** to fetch a token. For Authorization Code, OwnShell opens the authorization page in your **default browser** and waits up to 5 minutes for the redirect on a one-time loopback address `http://127.0.0.1:<random port>/callback`. Register that pattern as redirect URI with your provider. PKCE uses S256 and a random `state`.
- Sending never opens the browser. Without a valid token, the send fails and asks you to use **Get new token**.
- A token is reused until 30 seconds before it expires, then refreshed with the refresh token. If that fails, a new grant runs (Client Credentials) or you are asked to get a new token.
- Token and authorization URLs must use `https` (plain `http` only for `localhost`, `127.x.x.x` and `[::1]`). Token requests always go **directly from your Mac**, never through an SSH host, with TLS verification on.
- The request must be saved before you can fetch a token. **Clear token** deletes the cached token.
- With *Inherit*, the token is cached on the folder and shared by its requests.

::: tip What is encrypted
The OAuth client secret, bearer tokens, Basic passwords, API key values and the OAuth access and refresh tokens are encrypted with your master password and never shown again: the field says the value is stored, leave it empty to keep it, type to replace it or use **Remove stored secret**. A value that only references variables, like `{{TOKEN}}`, holds no secret itself and stays visible. Values saved by older versions are encrypted the first time you open the API client after unlocking.
:::

## Variables

Use `{{name}}` in the URL, params, headers, body and auth fields. Typing `{{` opens autocomplete.

### Scopes and precedence

From highest to lowest:

1. **Runtime**: values captured during a collection run
2. **Request** variables (Variables section)
3. **Folder** variables, nearest folder first
4. **Collection** variables (top-level folder)
5. **Environment**: the vault environment selected for the request
6. **Global** variables

Folder, collection and global variables are edited with **Variables…** in the sidebar menus. Folder and global variables can be marked **secret**: the value is stored encrypted and never shown again. Request variables are plain text. Vault environment values are always encrypted (see [Vault & environments](/features/vault)).

An unknown variable stops the request before anything is sent and lists the scopes that were searched.

### Built-in variables

| Variable | Value |
| --- | --- |
| `{{$uuid}}` | a random UUID v4 |
| `{{$timestamp}}` | Unix time in seconds |
| `{{$isoTimestamp}}` | current time in ISO 8601 |

The time is taken once per request, so every `$timestamp` in one request has the same value.

## Sending through an SSH host

Each request has a route selector: **Direct** or one of your SSH hosts. With a host selected, OwnShell opens an SSH channel (like `ssh -W`) from that host to the target.

- Hostnames are resolved **on the server side**, so internal names and private addresses work as seen from the host.
- HTTPS is encrypted end to end between OwnShell and the target; the SSH host only forwards bytes.
- HTTP, HTTPS, WebSocket and SSE all work through the host. An existing SSH session to the host is reused.
- A routed request never falls back to direct. Redirects are only followed to the same host and port.
- If the host cannot reach the target, the request is not sent and you see an error.

## Request settings

The **Settings** section applies to the current request:

| Setting | Default | Notes |
| --- | --- | --- |
| Timeout | 30 s | 1–600 s for the whole request, including redirects and body. For SSE it covers the time until the headers, then acts as an idle timeout. |
| Follow redirects | on | Up to 10 redirects. Credentials (Authorization, Cookie, API keys) are removed when a redirect goes to another origin. |
| Verify TLS certificates | on | When off, the request shows a "TLS not verified" warning. |
| Use cookie jar | on | Send and store cookies for this request. |

## Import and export

### curl

- **Import curl** from the sidebar, or paste a command starting with `curl ` into the URL field. Supported options include `-X`, `-H`, `-A`, `-e`, `-b`, `-u`, `--oauth2-bearer`, `-d`/`--data*`, `--json`, `-F`, `--form-string`, `-G`, `-I`, `-k`, `-L`, `-m` and `--url`. Ignored options are listed after import.
- **Copy as curl (variables as placeholders)** keeps secrets and credential headers as `{{…}}`. **Copy as curl (variables resolved)** inserts real values after a confirmation. OAuth tokens are always exported as `{{oauthAccessToken}}`.

### Postman

**Import Postman…** reads Postman collections v2.0 and v2.1 and Postman environments (up to 20 MB and 10,000 items).

- Bearer, Basic, API key, no-auth and inherit are mapped. Other auth types (including Postman's OAuth 2.0) become *No Auth* with a warning.
- Raw, urlencoded, form-data, file and GraphQL bodies are mapped. File parts keep only the file name; select the files again.
- Collection and folder variables are imported; Postman secret variables become secret variables. `{{$guid}}` and `{{$randomUUID}}` become `{{$uuid}}`.
- An environment file becomes a vault environment.
- Scripts are not imported; you get a warning.

Every import creates a new top-level folder. Nothing existing is overwritten.

### OwnShell files (`.ownshell-api.json`)

**Export as OwnShell file…** writes a folder to a readable JSON file you can commit to Git; **Import OwnShell file…** reads it back.

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

The export is deterministic (fixed key order, sidebar order, 2-space indentation), so diffs stay small. It **leaves out secrets**: secret variable values are empty, the OAuth client secret is never written, and bearer/basic/API-key values and sensitive headers become `{{placeholders}}`. The selected SSH host, environment and cookie jar setting are not part of the file. Files from a newer major format version are refused.

## History

The **History** panel keeps the last 200 sends (including WebSocket connects): method, URL template, status, duration and size. It stores **no bodies, headers or resolved values**; credentials in URLs are redacted. Click an entry to open the saved request, or right-click to create a new request from its URL. **Clear history** does not touch saved requests.

## Cookies

OwnShell has one cookie jar for the workspace. Cookies from responses are stored and sent according to RFC 6265 (domain and path matching, `Secure` only over HTTPS, public-suffix domains rejected).

- Values are encrypted and never shown, exported or backed up.
- Up to 50 cookies per domain and 3000 in total; the oldest are dropped first.
- The **Cookies** dialog lists domain, path, name and flags, and lets you delete single cookies or clear all.
- Turn the jar off per request in **Settings**.

## GraphQL

Choose the **GraphQL** body type to get a query editor, **Variables (JSON)** and an optional operation name. Variables may contain `{{…}}`; the result must be valid JSON. **Fetch schema** runs an introspection query (through the same route and auth as the request) and shows a searchable list of types and fields.

## WebSocket

Switch a request to **WebSocket** in the URL bar menu, then connect.

![WebSocket session with sent and received messages](/screenshots/api-websocket.png)

- Uses the same auth, variables, cookies, TLS setting and SSH route as HTTP requests. The timeout applies to the handshake.
- Send **text** messages with ⌘↩ from the composer; **Format JSON** tidies the message. Received binary messages show as a placeholder with their size.
- Messages up to 4 MB. The log keeps the last 1000 messages (or about 5 million characters).
- No compression and no subprotocols.

## Server-Sent Events

A response with `Content-Type: text/event-stream` is streamed live as a list of events (event name, data, id, time). Events up to 1 MB; the viewer keeps the last 1000 events (or about 5 million characters). There is no automatic reconnect. The stream ends with *Stream ended*, *Stream stopped* or *Stream idle timeout*.

## Collection runner and tests

**Run folder** runs every saved request in a folder one after another (sub-folders first, in sidebar order), up to 500 requests. Unsaved changes are not included and WebSocket requests are skipped. Enable **Stop on first failure** to stop early.

### Assertions

Add checks in a request's **Tests** section (up to 100 per request):

| Assertion | Example |
| --- | --- |
| Status is | `200, 201` |
| Status in range | `200-299` |
| Header exists | `content-type` |
| Header equals | `content-type` = `application/json` |
| JSON value equals | `$.data.status` = `"paid"` |
| JSON value exists | `$.items[0].id` |
| JSON value contains | `$.message` contains `ok` |
| Response time below (ms) | `500` |

JSON paths can be written as `$.items[0].name`, `items[0]["key"]` or `data.0.id`. A request without assertions passes when it gets a response.

### Captures

A capture stores a JSON value from the response in a runtime variable, for example `token` from `$.access_token`. Later requests in the same run can use `{{token}}`; runtime variables win over every other scope. Captured values live in memory for the run only.

The run report shows status, time, assertion results with actual values and captured variables per request, plus a summary. Results are not stored.

## Keyboard shortcuts

These work while the API client has focus and no menu or dialog is open.

| Shortcut | Action |
| --- | --- |
| ⌘↩ | Send (Connect for WebSocket) |
| ↩ in the URL field | Send |
| ⌘S | Save |
| Esc | Cancel a running request (Disconnect for WebSocket) |
| ⌘↩ in the WebSocket composer | Send message |
| ↑ / ↓, ↩ or Tab, Esc | Move, pick or close variable autocomplete |

::::
