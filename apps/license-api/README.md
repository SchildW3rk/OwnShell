# OwnShell License API

Cloudflare Worker for server-signed OwnShell entitlements.

## Secrets

The current desktop public key matches the local, ignored private key at:

```text
.secrets/ownshell-license-private-key.jwk
```

Set that JSON as a Worker secret:

```bash
npx wrangler secret put ENTITLEMENT_PRIVATE_KEY_JWK --cwd apps/license-api
```

Paste the contents of `.secrets/ownshell-license-private-key.jwk`.

The desktop app contains only the public key and verifies every entitlement locally.
Use `npm run generate:keys --workspace=ownshell-license-api` only when rotating keys; then also update the desktop public key in `apps/desktop/electron/license/entitlement.ts`.

## Runtime

Wrangler 4 requires Node 22+. If your shell uses an older Node, run Wrangler through Volta:

```bash
volta run --node 22.22.0 npx wrangler whoami --cwd apps/license-api
```

## Rate limiting

Activation, refresh and deactivation requests are limited per client IP and per device
with the Workers Rate Limiting API. The four `[[ratelimits]]` bindings live in
`wrangler.toml`; no extra resource has to be created, but each `namespace_id` must be
unique within the Cloudflare account. Requests fail with HTTP 500 if a binding is missing.

## Local development

```bash
npm run dev --workspace=ownshell-license-api
OWNSHELL_LICENSE_API_URL=http://127.0.0.1:8787 npm run dev:electron --workspace=ownshell-desktop
```

Packaged desktop builds ignore `OWNSHELL_LICENSE_API_URL` and use the production endpoint.

## Production endpoint

The desktop app currently targets:

```text
https://license.ownshell.app
```

Add that custom domain to the Worker before publishing the desktop update.
