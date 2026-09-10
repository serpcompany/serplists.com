// Run in a child process so Wrangler's synchronous work cannot block Vitest IPC.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { count, eq } from 'drizzle-orm';
import { createDb, schema } from '../../functions/api/db.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(repoRoot, 'package.json'));
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare } = wranglerRequire('miniflare');
const { build } = wranglerRequire('esbuild');
const webhookSecret = 'whsec_issue131_local_only';
const databaseId = '13113113-1131-4131-8131-131131131131';
const workDir = mkdtempSync('/tmp/serplists-issue131-');
const configPath = path.join(workDir, 'wrangler.toml');
let miniflare;

function migrationNames() {
  return readdirSync(path.join(repoRoot, 'db/migrations'))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort();
}

function stripePayload(id, type, object) {
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({ id, type, created: timestamp, livemode: false, data: { object } });
  const signature = createHmac('sha256', webhookSecret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  return { body, signature: `t=${timestamp},v1=${signature}` };
}

try {
  writeFileSync(configPath, [
    'name = "issue131-stripe-write-failure"',
    'compatibility_date = "2025-12-01"',
    '[[d1_databases]]',
    'binding = "DB"',
    'database_name = "issue131-stripe-write-failure"',
    `database_id = "${databaseId}"`,
    `migrations_dir = "${path.join(repoRoot, 'db/migrations')}"`,
    '',
  ].join('\n'));

  execFileSync(
    process.execPath,
    [
      path.join(repoRoot, 'node_modules/wrangler/bin/wrangler.js'),
      'd1',
      'migrations',
      'apply',
      'issue131-stripe-write-failure',
      '--local',
      '--config',
      configPath,
    ],
    {
      cwd: workDir,
      env: {
        ...process.env,
        CI: 'true',
        WRANGLER_SEND_METRICS: 'false',
        WRANGLER_LOG_PATH: path.join(workDir, 'wrangler.log'),
      },
      stdio: 'pipe',
    },
  );

  const bundle = await build({
    stdin: {
      contents: `import api from './functions/api/[[route]].ts'; export default api;`,
      resolveDir: repoRoot,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    conditions: ['workerd', 'worker', 'browser'],
    external: ['node:*'],
    target: 'es2022',
    logLevel: 'silent',
  });

  const stripeCalls = [];
  let customerAttempt = 0;
  miniflare = new Miniflare({
    modules: true,
    script: bundle.outputFiles[0].text,
    compatibilityDate: '2025-12-01',
    compatibilityFlags: ['nodejs_compat'],
    d1Databases: { DB: databaseId },
    d1Persist: path.join(workDir, '.wrangler/state/v3/d1'),
    bindings: {
      BETTER_AUTH_SECRET: 'issue131-local-auth-secret-at-least-32-chars',
      FRONTEND_URL: 'http://localhost',
      STRIPE_SECRET_KEY: 'sk_test_issue131_local_only',
      STRIPE_WEBHOOK_SECRET: webhookSecret,
      STRIPE_PRO_PRICE_ID: 'price_issue131_local_only',
    },
    outboundService: async (request) => {
      const url = new URL(request.url);
      assert.equal(url.origin, 'https://api.stripe.com');
      assert.equal(request.method, 'POST');
      const form = Object.fromEntries(new URLSearchParams(await request.text()));
      stripeCalls.push({ path: url.pathname, form });
      if (url.pathname === '/v1/customers') {
        customerAttempt += 1;
        return Response.json({ id: `cus_issue131_checkout_${customerAttempt}` });
      }
      if (url.pathname === '/v1/checkout/sessions') {
        return Response.json({ id: 'cs_issue131', url: 'https://checkout.stripe.test/issue131' });
      }
      throw new Error(`Unexpected Stripe operation ${url.pathname}`);
    },
  });

  const db = await miniflare.getD1Database('DB');
  const orm = createDb({ DB: db });
  const applied = await db.prepare('SELECT name FROM d1_migrations ORDER BY id').all();
  assert.deepEqual(applied.results.map((row) => row.name), migrationNames());

  const users = [
    ['issue131-checkout', 'issue131-checkout@e2e.local'],
    ['issue131-customer-insert', 'issue131-customer-insert@e2e.local'],
    ['issue131-customer-update', 'issue131-customer-update@e2e.local'],
    ['issue131-subscription', 'issue131-subscription@e2e.local'],
    ['issue131-event-update', 'issue131-event-update@e2e.local'],
  ];
  for (const [id, email] of users) {
    await orm.insert(schema.users).values({ id, email, name: id, username: id, email_verified: true, created_at: '2026-09-05', auth_created_at: new Date(1788566400000), auth_updated_at: new Date(1788566400000) });
  }
  await orm.insert(schema.account).values({ id: 'issue131-credential', accountId: 'issue131-checkout', providerId: 'credential', userId: 'issue131-checkout', password: '$2b$10$ai6w4pGPSwjTsx8h9eRuHOHz956SooVhr7NpOMxLCB.v4MhZfVnfa', createdAt: new Date(1788566400000), updatedAt: new Date(1788566400000) });

  let cookie = '';
  async function request(route, { method = 'GET', body, headers = {}, expected = 200, authenticated = true } = {}) {
    const response = await miniflare.dispatchFetch(`http://localhost${route}`, {
      method,
      redirect: 'manual',
      headers: {
        ...(authenticated && cookie ? { Cookie: cookie } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    assert.equal(response.status, expected, `${method} ${route}: ${text.slice(0, 400)}`);
    return { response, text, json: () => JSON.parse(text) };
  }

  async function webhook(id, type, object, expected = 200) {
    const payload = stripePayload(id, type, object);
    return request('/api/stripe/webhook', {
      method: 'POST',
      body: payload.body,
      headers: { 'Stripe-Signature': payload.signature },
      expected,
      authenticated: false,
    });
  }

  async function event(id) {
    return (await orm.select({ id: schema.stripe_webhook_events.id, error: schema.stripe_webhook_events.error }).from(schema.stripe_webhook_events).where(eq(schema.stripe_webhook_events.id, id)).limit(1))[0] ?? null;
  }

  async function assertFailedEvent(id) {
    const row = await event(id);
    assert(row, `${id} remains persisted for retry`);
    assert.notEqual(row.error, null, `${id} is not marked complete`);
  }

  const login = await request('/api/auth/sign-in/email', {
    method: 'POST',
    body: { email: 'issue131-checkout@e2e.local', password: 'password123' },
    headers: { Origin: 'http://localhost' },
    authenticated: false,
  });
  cookie = login.response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  assert(cookie.includes('session_token'));

  // Checkout: a non-conflict customer INSERT failure must stop before session creation.
  await db.prepare("CREATE TRIGGER issue131_checkout_insert_failure BEFORE INSERT ON stripe_customers BEGIN SELECT RAISE(ABORT, 'issue131 checkout mapping insert failure'); END").run();
  await request('/api/billing/checkout', { method: 'POST', body: {}, expected: 500 });
  assert.equal(stripeCalls.filter((call) => call.path === '/v1/checkout/sessions').length, 0);
  assert.equal((await orm.select().from(schema.stripe_customers).where(eq(schema.stripe_customers.user_id, 'issue131-checkout')).limit(1))[0] ?? null, null);
  await db.prepare('DROP TRIGGER issue131_checkout_insert_failure').run();
  const checkoutRetry = await request('/api/billing/checkout', { method: 'POST', body: {} });
  assert.equal(checkoutRetry.json().url, 'https://checkout.stripe.test/issue131');
  assert.equal((await orm.select({ stripe_customer_id: schema.stripe_customers.stripe_customer_id }).from(schema.stripe_customers).where(eq(schema.stripe_customers.user_id, 'issue131-checkout')).limit(1))[0].stripe_customer_id, 'cus_issue131_checkout_2');
  assert.equal(stripeCalls.filter((call) => call.path === '/v1/checkout/sessions').length, 1);

  // Webhook event INSERT failure: no row is a retryable absence, never duplicate success.
  await db.prepare("CREATE TRIGGER issue131_event_insert_failure BEFORE INSERT ON stripe_webhook_events BEGIN SELECT RAISE(ABORT, 'issue131 event insert failure'); END").run();
  await webhook('evt_issue131_event_insert', 'checkout.session.completed', {
    client_reference_id: 'issue131-customer-insert', customer: 'cus_issue131_event_insert',
  }, 500);
  assert.equal(await event('evt_issue131_event_insert'), null);
  assert.equal((await orm.select().from(schema.stripe_customers).where(eq(schema.stripe_customers.user_id, 'issue131-customer-insert')).limit(1))[0] ?? null, null);
  await db.prepare('DROP TRIGGER issue131_event_insert_failure').run();
  await webhook('evt_issue131_event_insert', 'checkout.session.completed', {
    client_reference_id: 'issue131-customer-insert', customer: 'cus_issue131_event_insert',
  });
  assert.equal((await event('evt_issue131_event_insert')).error, null);

  // Customer INSERT failure leaves an errored event, then applies exactly once on retry.
  await orm.delete(schema.stripe_customers).where(eq(schema.stripe_customers.user_id, 'issue131-customer-insert'));
  await db.prepare("CREATE TRIGGER issue131_customer_insert_failure BEFORE INSERT ON stripe_customers BEGIN SELECT RAISE(ABORT, 'issue131 customer insert failure'); END").run();
  await webhook('evt_issue131_customer_insert', 'checkout.session.completed', {
    client_reference_id: 'issue131-customer-insert', customer: 'cus_issue131_customer_insert',
  }, 500);
  await assertFailedEvent('evt_issue131_customer_insert');
  assert.equal((await orm.select().from(schema.stripe_customers).where(eq(schema.stripe_customers.user_id, 'issue131-customer-insert')).limit(1))[0] ?? null, null);
  await db.prepare('DROP TRIGGER issue131_customer_insert_failure').run();
  await webhook('evt_issue131_customer_insert', 'checkout.session.completed', {
    client_reference_id: 'issue131-customer-insert', customer: 'cus_issue131_customer_insert',
  });
  assert.equal((await event('evt_issue131_customer_insert')).error, null);
  const duplicateCustomerInsert = await webhook('evt_issue131_customer_insert', 'checkout.session.completed', {
    client_reference_id: 'issue131-customer-insert', customer: 'cus_issue131_customer_insert',
  });
  assert.equal(duplicateCustomerInsert.json().duplicate, true);
  assert.equal(Number((await orm.select({ n: count() }).from(schema.stripe_customers).where(eq(schema.stripe_customers.user_id, 'issue131-customer-insert')))[0].n), 1);

  // Customer conflict UPDATE failure propagates instead of masquerading as success.
  await orm.insert(schema.stripe_customers).values({ user_id: 'issue131-customer-update', stripe_customer_id: 'cus_issue131_old', created_at: '2026-09-05' });
  await db.prepare("CREATE TRIGGER issue131_customer_update_failure BEFORE UPDATE ON stripe_customers BEGIN SELECT RAISE(ABORT, 'issue131 customer update failure'); END").run();
  await webhook('evt_issue131_customer_update', 'checkout.session.completed', {
    client_reference_id: 'issue131-customer-update', customer: 'cus_issue131_new',
  }, 500);
  await assertFailedEvent('evt_issue131_customer_update');
  assert.equal((await orm.select({ stripe_customer_id: schema.stripe_customers.stripe_customer_id }).from(schema.stripe_customers).where(eq(schema.stripe_customers.user_id, 'issue131-customer-update')).limit(1))[0].stripe_customer_id, 'cus_issue131_old');
  await db.prepare('DROP TRIGGER issue131_customer_update_failure').run();
  await webhook('evt_issue131_customer_update', 'checkout.session.completed', {
    client_reference_id: 'issue131-customer-update', customer: 'cus_issue131_new',
  });
  assert.equal((await orm.select({ stripe_customer_id: schema.stripe_customers.stripe_customer_id }).from(schema.stripe_customers).where(eq(schema.stripe_customers.user_id, 'issue131-customer-update')).limit(1))[0].stripe_customer_id, 'cus_issue131_new');

  const subscriptionBase = {
    id: 'sub_issue131',
    customer: 'cus_issue131_subscription',
    status: 'active',
    metadata: { userId: 'issue131-subscription' },
    items: { data: [{ price: { id: 'price_issue131' } }] },
    current_period_end: 1999999999,
  };

  // Subscription INSERT and UPDATE faults both preserve retryable ledger state.
  await db.prepare("CREATE TRIGGER issue131_subscription_insert_failure BEFORE INSERT ON stripe_subscriptions BEGIN SELECT RAISE(ABORT, 'issue131 subscription insert failure'); END").run();
  await webhook('evt_issue131_subscription_insert', 'customer.subscription.created', subscriptionBase, 500);
  await assertFailedEvent('evt_issue131_subscription_insert');
  assert.equal((await orm.select().from(schema.stripe_subscriptions).where(eq(schema.stripe_subscriptions.stripe_subscription_id, 'sub_issue131')).limit(1))[0] ?? null, null);
  await db.prepare('DROP TRIGGER issue131_subscription_insert_failure').run();
  await webhook('evt_issue131_subscription_insert', 'customer.subscription.created', subscriptionBase);
  assert.equal((await event('evt_issue131_subscription_insert')).error, null);
  assert.equal((await orm.select({ status: schema.stripe_subscriptions.status }).from(schema.stripe_subscriptions).where(eq(schema.stripe_subscriptions.stripe_subscription_id, 'sub_issue131')).limit(1))[0].status, 'active');

  await db.prepare("CREATE TRIGGER issue131_subscription_update_failure BEFORE UPDATE ON stripe_subscriptions BEGIN SELECT RAISE(ABORT, 'issue131 subscription update failure'); END").run();
  await webhook('evt_issue131_subscription_update', 'customer.subscription.updated', { ...subscriptionBase, status: 'past_due' }, 500);
  await assertFailedEvent('evt_issue131_subscription_update');
  assert.equal((await orm.select({ status: schema.stripe_subscriptions.status }).from(schema.stripe_subscriptions).where(eq(schema.stripe_subscriptions.stripe_subscription_id, 'sub_issue131')).limit(1))[0].status, 'active');
  await db.prepare('DROP TRIGGER issue131_subscription_update_failure').run();
  await webhook('evt_issue131_subscription_update', 'customer.subscription.updated', { ...subscriptionBase, status: 'past_due' });
  assert.equal((await orm.select({ status: schema.stripe_subscriptions.status }).from(schema.stripe_subscriptions).where(eq(schema.stripe_subscriptions.stripe_subscription_id, 'sub_issue131')).limit(1))[0].status, 'past_due');
  const duplicateSubscription = await webhook('evt_issue131_subscription_update', 'customer.subscription.updated', { ...subscriptionBase, status: 'past_due' });
  assert.equal(duplicateSubscription.json().duplicate, true);
  assert.equal(Number((await orm.select({ n: count() }).from(schema.stripe_subscriptions).where(eq(schema.stripe_subscriptions.stripe_subscription_id, 'sub_issue131')))[0].n), 1);

  // Event completion UPDATE failure remains non-successful and retryable.
  await db.prepare("CREATE TRIGGER issue131_event_update_failure BEFORE UPDATE ON stripe_webhook_events BEGIN SELECT RAISE(ABORT, 'issue131 event update failure'); END").run();
  await webhook('evt_issue131_event_update', 'unhandled.issue131', {}, 500);
  await assertFailedEvent('evt_issue131_event_update');
  await db.prepare('DROP TRIGGER issue131_event_update_failure').run();
  await webhook('evt_issue131_event_update', 'unhandled.issue131', {});
  assert.equal((await event('evt_issue131_event_update')).error, null);
  const duplicateEvent = await webhook('evt_issue131_event_update', 'unhandled.issue131', {});
  assert.equal(duplicateEvent.json().duplicate, true);

  console.log(JSON.stringify({
    result: 'pass',
    environment: 'local-full-migration-replay',
    binding: 'DB',
    databaseName: 'issue131-stripe-write-failure',
    databaseId: `local:miniflare:${databaseId}`,
    node: process.version,
    migrations: applied.results.length,
    scenarios: [
      'checkout-customer-insert-failure',
      'event-insert-failure',
      'customer-insert-failure',
      'customer-update-failure',
      'subscription-insert-failure',
      'subscription-update-failure',
      'event-update-failure',
      'retry-and-duplicate-replay',
    ],
    outboundStripeTransport: 'local-double-only',
    checkoutSessionsAfterFailedMapping: 0,
  }));
} finally {
  if (miniflare) await miniflare.dispose();
  rmSync(workDir, { recursive: true, force: true });
}
