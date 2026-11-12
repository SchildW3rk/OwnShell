# OwnShell Landing

## Development

```bash
volta run --node 22.22.0 npm run dev --workspace=landing
```

## Lemon Squeezy Checkout

The pricing buttons require Vite environment variables at build time:

```bash
VITE_LEMON_CHECKOUT_URL=https://<store>.lemonsqueezy.com/checkout/buy/<checkout-id>
VITE_LEMON_MONTHLY_CHECKOUT_URL=https://<store>.lemonsqueezy.com/checkout/buy/<monthly-checkout-id>
VITE_LEMON_YEARLY_CHECKOUT_URL=https://<store>.lemonsqueezy.com/checkout/buy/<yearly-checkout-id>
```

Use `VITE_LEMON_CHECKOUT_URL` when Lemon Squeezy shows a single checkout where
customers choose between variants. Use the plan-specific variables only when
monthly and annual should point to different checkout URLs.

The production deploy script (`deploy.sh`, Caddy behind a central reverse proxy)
loads the allowed checkout variables from `$REMOTE_PATH/.env` on the server
before building locally. It requires `SSH_HOST`, `REMOTE_PATH` and `CADDYFILE`
to be set and writes the site's security headers (CSP etc.) into the Caddy
route. Do not commit live checkout URLs.

Use Lemon Squeezy test checkout URLs locally when testing purchases.

If either URL is missing or is not an HTTPS Lemon Squeezy URL, that plan button
is rendered as disabled.
