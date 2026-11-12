# OwnShell Landing

## Development

```bash
volta run --node 22.22.0 npm run dev --workspace=landing
```

## Lemon Squeezy Checkout

The "Commercial / Individual" license button requires a Vite environment variable at build time:

```bash
VITE_LEMON_INDIVIDUAL_CHECKOUT_URL=https://<store>.lemonsqueezy.com/checkout/buy/<checkout-id>
```

The production deploy script (`deploy.sh`, Caddy behind a central reverse proxy)
loads the allowed checkout variable from `$REMOTE_PATH/.env` on the server
before building locally. It requires `SSH_HOST`, `REMOTE_PATH` and `CADDYFILE`
to be set and writes the site's security headers (CSP etc.) into the Caddy
route. Do not commit live checkout URLs.

Use Lemon Squeezy test checkout URLs locally when testing purchases.

If the URL is missing or is not an HTTPS Lemon Squeezy URL, the button is
rendered as disabled ("Checkout not configured").

## Docs at /docs

`deploy.sh` also builds the VitePress user docs from `docs/` (`npm ci --prefix docs`
on first run or with `RUN_INSTALL=1`, then `npm run build --prefix docs`) and syncs
`docs/.vitepress/dist` to `$REMOTE_PATH/dist/docs`, served at `https://ownshell.app/docs/`.
The docs get their own Content-Security-Policy: scripts are limited to `'self'` plus the
sha256 hashes of VitePress' inline scripts, computed at deploy time by
`docs/scripts/csp-hashes.mjs`. Local preview: `npm run docs:dev` from the repo root.
