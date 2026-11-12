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
