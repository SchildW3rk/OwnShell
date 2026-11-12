'use strict';
const { wait, setNearestState, PASSWORD } = require('./capture.cjs');

async function typeLines(page, lines, pause = 350) {
  for (const line of lines) { await page.keyboard.type(line + '\n', { delay: 8 }); await wait(pause); }
}

const section = (page, name) => page.getByRole('button', { name, exact: true }).first().click().then(() => wait(800));

async function closeLocalPane(page) {
  const local = page.getByText('Local Terminal', { exact: true });
  if (await local.count()) { await page.locator('button:has(svg.lucide-x)').last().click(); await wait(500); }
}

async function closePanes(page) {
  for (let i = 0; i < 6; i++) {
    const close = page.locator('button:has(svg.lucide-x)');
    if (await close.count() === 0) break;
    await close.last().click().catch(() => {});
    await wait(300);
  }
}

async function seed(page, env, hostId) {
  await page.evaluate(async ({ env, hostId }) => {
    const api = window.electronAPI;
    const cred = (title, username, password, url, tags) => api.vault.credentials.create({ title, username, password, url, notes: null, tags });
    await cred('Postgres – production', 'app', 'example-not-a-real-password', 'postgres://db.internal:5432/app', ['database', 'prod']);
    await cred('Container registry', 'ci-bot', 'example-registry-token', 'https://registry.example.com', ['ci']);
    await cred('Grafana admin', 'admin', 'example-grafana-password', 'https://grafana.example.com', ['monitoring']);
    await cred('SMTP relay', 'mailer@example.com', 'example-smtp-password', 'smtp://mail.example.com:587', ['mail']);
    await api.vault.environments.create({ name: 'production', project: 'acme-shop', description: 'Runtime configuration for the acme-shop stack', host_id: hostId, default_remote_path: '/srv/acme-shop/.env', variables: [
      { key: 'DATABASE_URL', value: 'postgres://app:example-password@db.internal:5432/app' },
      { key: 'REDIS_URL', value: 'redis://cache.internal:6379/0' },
      { key: 'JWT_SECRET', value: 'example-jwt-secret-not-real' },
      { key: 'SMTP_HOST', value: 'mail.example.com' },
      { key: 'LOG_LEVEL', value: 'info' },
    ] });
    await api.vault.environments.create({ name: 'staging', project: 'acme-shop', description: null, host_id: null, default_remote_path: null, variables: [{ key: 'DATABASE_URL', value: 'postgres://app:example@db.staging.internal:5432/app' }, { key: 'LOG_LEVEL', value: 'debug' }] });
    await api.dbConnections.create({ name: 'shop.sqlite', type: 'sqlite', filePath: env.sqlite, color: '#22c55e' });
    const billing = await api.apiClient.collections.create({ name: 'Billing API', description: 'Invoices, customers and webhooks' });
    const billingId = billing.id ?? billing.data?.id;
    await api.apiClient.variables.set(billingId, [{ key: 'base_url', value: env.apiUrl, enabled: true, secret: false }, { key: 'events_url', value: env.wsUrl, enabled: true, secret: false }, { key: 'api_key', value: 'sk_test_example', enabled: true, secret: true }]);
    const folder = async name => { const c = await api.apiClient.collections.create({ name, parent_id: billingId }); return c.id ?? c.data?.id; };
    const invoices = await folder('Invoices');
    const customers = await folder('Customers');
    const events = await folder('Events');
    const json = v => JSON.stringify(v, null, 2);
    const req = (collection_id, name, method, url, extra = {}) => api.apiClient.requests.create({ collection_id, name, method, url, ...extra });
    const headers = JSON.stringify([{ key: 'Authorization', value: 'Bearer {{api_key}}', enabled: true }, { key: 'Idempotency-Key', value: 'inv-2026-0042', enabled: true }]);
    await req(invoices, 'Create invoice', 'POST', '{{base_url}}/v1/invoices', { body_type: 'json', headers, body: json({ customer: 'cus_88', currency: 'eur', lines: [{ description: 'Pro plan (yearly)', quantity: 1, unit_amount: 12990 }], due_in_days: 30 }) });
    await req(invoices, 'List invoices', 'GET', '{{base_url}}/v1/invoices?status=open');
    await req(invoices, 'Void invoice', 'DELETE', '{{base_url}}/v1/invoices/inv_2026_0042');
    await req(customers, 'Get customer', 'GET', '{{base_url}}/v1/customers/cus_88');
    await req(customers, 'Update customer', 'PATCH', '{{base_url}}/v1/customers/cus_88', { body_type: 'json', body: json({ email: 'avery@example.com' }) });
    await req(events, 'Order events', 'GET', '{{events_url}}/orders', { kind: 'websocket' });
    const status = await api.apiClient.collections.create({ name: 'Status page' });
    await req(status.id ?? status.data?.id, 'Health check', 'GET', '{{base_url}}/healthz');
    await api.projects.create({ name: 'acme-shop', host_id: hostId, repository_path: '~/acme-shop', compose_project: 'acme-shop' });
  }, { env: { apiUrl: env.apiUrl, wsUrl: env.wsUrl, sqlite: env.sqlite }, hostId });
  await page.reload();
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Servers', exact: true }).waitFor();
  await wait(1000);
}

async function openHost(ctx) {
  const { page, ssh } = ctx;
  if (ctx.hostOpen) return;
  await page.getByRole('button', { name: 'Servers', exact: true }).click();
  await page.getByRole('button', { name: 'acme-prod-1', exact: true }).click();
  await page.waitForSelector('.xterm');
  await page.getByText('password:').first().waitFor();
  await page.locator('.xterm-helper-textarea').first().focus();
  await page.keyboard.type(ssh.password + '\n');
  await wait(1500);
  ctx.hostOpen = true;
}

module.exports = [
  {
    name: 'terminal',
    async run(ctx) {
      const { page, env } = ctx;
      await openHost(ctx);
      await typeLines(page, ['clear', 'cd acme-shop', 'git log --oneline -5', 'git status -sb', "dps", 'df -h', 'uptime'], 500);
      await page.getByText('Local', { exact: true }).first().click();
      await wait(2000);
      await page.locator('.xterm-helper-textarea').last().focus();
      await typeLines(page, [`PS1='sam@laptop % '; cd ${env.localHome}/Projects/acme-shop; clear`, 'ls -AG', 'cat docker-compose.yml']);
      await wait(800);
    },
  },
  {
    name: 'sftp',
    async run(ctx) {
      const { page, env } = ctx;
      await openHost(ctx);
      await closeLocalPane(page);
      await page.getByText('Files', { exact: true }).last().click();
      await page.getByText('editor.txt').first().waitFor();
      await setNearestState(page.getByText('Applications', { exact: true }), '/', env.localHome);
      await setNearestState(page.getByText('editor.txt', { exact: true }), '.', '/srv/acme-shop');
      await page.getByText('docker-compose.yml').first().waitFor();
      await wait(1000);
    },
  },
  {
    name: 'docker',
    async run(ctx) {
      const { page, env } = ctx;
      if (!env.docker) throw new Error('skipped: no local Docker socket');
      await openHost(ctx);
      await closeLocalPane(page);
      await page.getByText('Docker', { exact: true }).first().click();
      const api = page.locator('text=acme-shop-api-1 >> visible=true').first();
      await api.waitFor();
      await api.click();
      await page.getByRole('button', { name: 'Logs', exact: true }).click();
      await page.locator('text=POST /v1/invoices >> visible=true').first().waitFor();
      await wait(1500);
    },
  },
  {
    name: 'projects-git',
    async run({ page }) {
      await closePanes(page);
      await section(page, 'Projects');
      await page.getByText('acme-shop', { exact: true }).first().click();
      await page.getByRole('button', { name: 'Code', exact: true }).click();
      for (const name of ['internal', 'orders', 'handler.go']) {
        await page.getByText(name, { exact: true }).first().click();
        await wait(700);
      }
      await page.getByText('package orders').first().waitFor();
      await wait(1000);
    },
  },
  {
    name: 'projects-diff',
    async run({ page }) {
      await page.getByRole('button', { name: /^Changes/ }).click();
      await page.getByText('handler.go').first().click();
      await page.getByText('method not allowed').first().waitFor();
      await wait(1500);
    },
  },
  {
    name: 'database',
    async run({ page }) {
      await closePanes(page);
      await section(page, 'Databases');
      await page.getByText('shop.sqlite', { exact: true }).first().click();
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      await page.getByText('orders', { exact: true }).first().click();
      await page.getByRole('button', { name: 'Query', exact: true }).click();
      await page.locator('.cm-content').first().click();
      await page.keyboard.press('Meta+a');
      await page.keyboard.type([
        'SELECT c.name, c.country, count(o.id) AS orders,',
        '       round(sum(o.total), 2) AS revenue',
        'FROM customers c',
        'JOIN orders o ON o.customer_id = c.id',
        "WHERE o.status IN ('paid', 'shipped')",
        'GROUP BY c.id',
        'ORDER BY revenue DESC;',
      ].join('\n'));
      await page.keyboard.press('Meta+Enter');
      await page.getByText('Avery Stone').first().waitFor();
      await wait(4500); // let the "connected" toast disappear
    },
  },
  {
    name: 'vault',
    async run({ page }) {
      await closePanes(page);
      await section(page, 'Security');
      await page.getByText('Vault', { exact: true }).first().click();
      await page.getByText('Postgres – production').first().waitFor();
      await wait(800);
    },
  },
  {
    name: 'vault-env',
    async reset({ page }) { await page.keyboard.press('Escape'); await wait(500); },
    async run({ page }) {
      await page.getByText('Environments', { exact: true }).first().click();
      await wait(800);
      const row = page.locator('tr', { hasText: 'production' }).first();
      await row.locator('button').last().click();
      await wait(500);
      await page.getByText('Edit Environment', { exact: true }).click();
      await page.getByText('Simple Mode', { exact: true }).waitFor();
      await wait(1200);
    },
  },
  {
    name: 'api-client',
    async run({ page }) {
      await closePanes(page);
      await section(page, 'API Client');
      for (const name of ['Billing API', 'Invoices', 'Customers', 'Create invoice']) {
        await page.getByText(name, { exact: true }).first().click();
        await wait(400);
      }
      await page.getByRole('button', { name: /^Body/ }).first().click();
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await page.getByText('201 Created').first().waitFor();
      await wait(1000);
    },
  },
  {
    name: 'api-websocket',
    async run({ page }) {
      await page.getByText('Events', { exact: true }).first().click();
      await wait(400);
      await page.getByText('Order events', { exact: true }).first().click();
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      await page.getByText('welcome').first().waitFor();
      const box = page.getByPlaceholder(/Message text/);
      for (const msg of ['{"type":"subscribe","topic":"orders"}', '{"type":"ping","seq":1}']) {
        await box.fill(msg);
        await page.getByRole('button', { name: 'Send', exact: true }).last().click();
        await wait(600);
      }
      await box.fill('{"type":"ack","id":"ord_1042"}');
      await wait(800);
    },
  },
];
module.exports.seed = seed;
