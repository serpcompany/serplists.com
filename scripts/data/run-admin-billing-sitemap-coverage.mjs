import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { and, count, eq } from 'drizzle-orm';
import { createDb, schema } from '../../functions/api/db.ts';

// This harness bundles the unchanged application modules into workerd. Only the
// external Stripe transport is doubled; every application query uses local D1.
export async function runAdminBillingSitemapCoverage({ repoRoot, persistPath, env = process.env }) {
  const require = createRequire(path.join(repoRoot, 'package.json'));
  const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
  const { Miniflare } = wranglerRequire('miniflare');
  const config = readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8').split('[env.')[0];
  const localId = config.match(/^preview_database_id\s*=\s*"([^"]+)"/m)?.[1];
  assert(localId, 'Resolve Wrangler local preview identity from current config');
  assert(path.resolve(persistPath).startsWith(path.join(repoRoot, '.wrangler') + path.sep), 'Disposable local persistence only');
  console.log(JSON.stringify({ environment: 'local', binding: 'DB', databaseName: 'serp-checklists-db', databaseId: `local:miniflare:${localId}`, commit: env.DATA_REGRESSION_START_COMMIT, migrationFrom: env.DATA_REGRESSION_MIGRATION_FROM, migrationTo: env.DATA_REGRESSION_MIGRATION_TO }));
  const calls = [];
  let checkoutMode = 'ok';
  const stripeCustomerIds = {
    'billing-coverage': 'cus_local_coverage',
    'billing-blank-customer': 'cus_local_blank_customer',
  };
  const mf = new Miniflare({ modules: true, scriptPath: path.resolve(repoRoot, env.PLAYWRIGHT_WORKER_PATH, 'index.js'),
    compatibilityDate: '2025-12-01', compatibilityFlags: ['nodejs_compat'],
    d1Persist: path.join(persistPath, 'v3/d1'), d1Databases: { DB: localId },
    r2Persist: path.join(persistPath, 'v3/r2'), r2Buckets: { R2_UPLOADS: 'route-coverage-uploads' },
    bindings: { BETTER_AUTH_SECRET: 'local-coverage-auth-secret-at-least-32-chars', FRONTEND_URL: 'http://localhost', ENTITLEMENTS_ADMIN_SECRET: 'local-admin-coverage', STRIPE_SECRET_KEY: 'sk_test_local_coverage_only', STRIPE_WEBHOOK_SECRET: 'whsec_local_coverage_only', STRIPE_PRO_PRICE_ID: 'price_local_coverage' },
    outboundService: async request => {
      const url = new URL(request.url);
      assert.equal(url.origin, 'https://api.stripe.com', 'Unexpected outbound networking is blocked');
      assert.equal(request.headers.get('authorization'), 'Bearer sk_test_local_coverage_only');
      assert.equal(request.method, 'POST');
      const form = Object.fromEntries(new URLSearchParams(await request.text()));
      calls.push({ path: url.pathname, form });
      if (url.pathname === '/v1/customers') {
        const userId = form['metadata[userId]'];
        const customerId = stripeCustomerIds[userId];
        assert(customerId, `Unexpected Stripe customer fixture ${userId}`);
        return Response.json({ id: customerId });
      }
      if (url.pathname === '/v1/checkout/sessions') return checkoutMode === 'error' ? Response.json({ error: 'local transport failure' }, { status: 503 }) : Response.json({ id: 'cs_local', url: checkoutMode === 'missing' ? null : 'https://checkout.stripe.test/local' });
      if (url.pathname === '/v1/billing_portal/sessions') return Response.json({ id: 'bps_local', url: 'https://billing.stripe.test/local' });
      throw new Error(`Unexpected Stripe operation ${url.pathname}`);
    },
  });
  const checked = [];
  let uploadsBucket;
  try {
    const db = await mf.getD1Database('DB');
    const orm = createDb({ DB: db });
    uploadsBucket = await mf.getR2Bucket('R2_UPLOADS');
    console.log('Local billing coverage: D1 ready');
    const ledger = await db.prepare('SELECT name FROM d1_migrations ORDER BY id').all();
    assert.deepEqual(ledger.results.map(row => row.name), readdirSync(path.join(repoRoot, 'db/migrations')).filter(name => /^\d+.*\.sql$/.test(name)).sort(), 'Exact full Wrangler migration ledger must exist');
    assert((await orm.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, 'coverage-owner')).limit(1))[0], 'Real migrated smoke fixture must exist');
    const [coverageAccount] = await orm.select({ password: schema.account.password, createdAt: schema.account.createdAt, updatedAt: schema.account.updatedAt }).from(schema.account).where(eq(schema.account.userId, 'coverage-owner')).limit(1);
    for (const fixture of [
      ['billing-coverage', 'billing-coverage@e2e.local', 'Billing Coverage', 'billing_coverage', 'billing-credential'],
      ['billing-blank-customer', 'billing-blank-customer@e2e.local', 'Billing Blank Customer', 'billing_blank_customer', 'billing-blank-credential'],
      ['stripe-checkout-insert', 'stripe-checkout-insert@e2e.local', 'Stripe Checkout Insert', 'stripe_checkout_insert', 'stripe-checkout-credential'],
      ['stripe-subscription-insert', 'stripe-subscription-insert@e2e.local', 'Stripe Subscription Insert', 'stripe_subscription_insert', 'stripe-subscription-credential'],
    ]) {
      const [id, email, name, username, accountId] = fixture;
      await orm.insert(schema.users).values({ id, email, name, username, email_verified: true, created_at: '2026-09-05', auth_created_at: new Date(1788566400000), auth_updated_at: new Date(1788566400000) });
      await orm.insert(schema.account).values({ id: accountId, accountId: id, providerId: 'credential', userId: id, password: coverageAccount.password, createdAt: coverageAccount.createdAt, updatedAt: coverageAccount.updatedAt });
    }
    await orm.insert(schema.stripe_customers).values({ user_id: 'billing-blank-customer', stripe_customer_id: '', created_at: '2026-09-05', updated_at: '2026-09-05' });
    let cookie = '';
    async function request(route, { method = 'GET', body, headers = {}, status = 200, authenticated = true } = {}) {
      const isFormData = body instanceof FormData;
      const requestUrl = /^https?:\/\//.test(route) ? route : `http://localhost${route}`;
      // Serialize multipart bytes with their matching boundary before crossing
      // Node/Miniflare's different fetch implementations.
      const multipart = isFormData ? new Request(requestUrl,{method,body}) : null;
      const requestBody = multipart ? await multipart.arrayBuffer() : typeof body === 'string' ? body : body === undefined ? undefined : JSON.stringify(body);
      const response = await mf.dispatchFetch(requestUrl, { method, redirect: 'manual', headers: { ...(authenticated && cookie ? { Cookie: cookie } : {}), ...(multipart ? Object.fromEntries(multipart.headers) : body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(requestBody !== undefined ? { body: requestBody } : {}) });
      const text = await response.text();
      assert.equal(response.status, status, `${method} ${route}: ${text.slice(0, 300)}`);
      return { response, text, json: () => JSON.parse(text) };
    }
    async function login(email) {
      const response = await request('/api/auth/sign-in/email', { method: 'POST', body: { email, password: 'password123' }, headers: { Origin: 'http://localhost' }, authenticated: false });
      cookie = response.response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
      assert(cookie.includes('session_token'), `Actual Better Auth session cookie for ${email}`);
    }
    await login('billing-coverage@e2e.local');

    const options = await request('/api/health', { method: 'OPTIONS', headers: { Origin: 'http://localhost', 'Access-Control-Request-Method': 'GET' }, authenticated: false });
    assert.equal(options.text, '');
    assert.equal(options.response.headers.get('access-control-allow-origin'), 'http://localhost');
    assert(options.response.headers.get('access-control-allow-methods')?.includes('OPTIONS'));
    const callsBeforeBlockedAuth = calls.length;
    const blockedAuth = await request('https://serplists.com/api/auth/sign-in/email', { method: 'POST', body: { email: 'coverage@serplists.dev', password: 'not-used' }, status: 403, authenticated: false });
    assert.equal(blockedAuth.json().error, 'Test accounts are disabled in production');
    assert.equal(calls.length, callsBeforeBlockedAuth, 'Production-host test email is blocked before outbound transport');
    await request('/api/templates/generate-from-clipy', { method: 'GET', status: 405 });
    checked.push('api-router-provider-denials');
    const plan = async () => (await request('/api/billing/status')).json().plan;
    assert.equal(await plan(), 'free');
    const admin = body => request('/api/admin/entitlements/override', { method: 'POST', body, headers: { 'X-Admin-Secret': 'local-admin-coverage' } });
    await request('/api/admin/entitlements/override', { method: 'POST', body: {}, status: 401 });
    await admin({ email: 'billing-coverage@e2e.local', plan: 'pro', note: 'local insert' });
    assert.equal(await plan(), 'pro');
    assert.equal((await orm.select({ note: schema.entitlement_overrides.note }).from(schema.entitlement_overrides).where(eq(schema.entitlement_overrides.user_id, 'billing-coverage')).limit(1))[0].note, 'local insert');
    await admin({ userId: 'billing-coverage', plan: 'free', note: 'local update' });
    assert.equal(await plan(), 'free');
    await admin({ userId: 'billing-coverage', plan: 'pro', expiresAt: 1 });
    assert.equal(await plan(), 'free', 'Expired override does not grant pro');
    for (const [body, status] of [[{},400], [{userId:'billing-coverage',plan:'team'},400], [{email:'absent@e2e.local'},404], ['{',400]]) await request('/api/admin/entitlements/override', { method: 'POST', body, status, headers: { 'X-Admin-Secret': 'local-admin-coverage' } });
    await request('/api/admin/entitlements/override?userId=billing-coverage', { method: 'DELETE', headers: { 'X-Admin-Secret': 'local-admin-coverage' } });
    assert.equal((await orm.select().from(schema.entitlement_overrides).where(eq(schema.entitlement_overrides.user_id, 'billing-coverage')).limit(1))[0] ?? null, null);
    checked.push('admin-mutations');

    await request('/api/billing/status', { authenticated: false, status: 401 });
    await request('/api/billing/status?teamId=coverage-team', { status: 404 });
    await request('/api/billing/portal', { method: 'POST', status: 400 });
    for (let i = 0; i < 2; i++) assert.equal((await request('/api/billing/checkout', { method: 'POST' })).json().url, 'https://checkout.stripe.test/local');
    assert.equal(calls.filter(call => call.path === '/v1/customers').length, 1, 'Existing D1 customer reused');
    assert.equal((await orm.select({ stripe_customer_id: schema.stripe_customers.stripe_customer_id }).from(schema.stripe_customers).where(eq(schema.stripe_customers.user_id, 'billing-coverage')).limit(1))[0].stripe_customer_id, 'cus_local_coverage');
    assert.equal(calls.find(call => call.path === '/v1/customers').form.email, 'billing-coverage@e2e.local');
    assert.equal(calls.find(call => call.path === '/v1/checkout/sessions').form['line_items[0][price]'], 'price_local_coverage');
    assert.equal((await request('/api/billing/portal', { method: 'POST' })).json().url, 'https://billing.stripe.test/local');
    await login('billing-blank-customer@e2e.local');
    assert.equal((await request('/api/billing/checkout', { method: 'POST' })).json().url, 'https://checkout.stripe.test/local');
    assert.equal((await orm.select({ stripe_customer_id: schema.stripe_customers.stripe_customer_id }).from(schema.stripe_customers).where(eq(schema.stripe_customers.user_id, 'billing-blank-customer')).limit(1))[0].stripe_customer_id, 'cus_local_blank_customer', 'Blank existing customer mapping is updated after insert conflict');
    assert.equal(calls.filter(call => call.path === '/v1/customers' && call.form['metadata[userId]'] === 'billing-blank-customer').length, 1);
    await login('billing-coverage@e2e.local');
    checkoutMode = 'missing'; await request('/api/billing/checkout', { method: 'POST', status: 500 });
    checkoutMode = 'error'; await request('/api/billing/checkout', { method: 'POST', status: 500 });
    checkoutMode = 'ok';
    async function webhook(id, type, object, status = 200) {
      const timestamp = Math.floor(Date.now() / 1000);
      const body = JSON.stringify({ id, type, created: timestamp, livemode: false, data: { object } });
      const signature = createHmac('sha256', 'whsec_local_coverage_only').update(`${timestamp}.${body}`).digest('hex');
      return (await request('/api/stripe/webhook', { method: 'POST', body, status, headers: { 'Stripe-Signature': `t=${timestamp},v1=${signature}` } })).json();
    }
    await request('/api/stripe/webhook', { method: 'POST', body: {}, status: 400 });
    const sub = { id: 'sub_local', customer: 'cus_local_coverage', status: 'active', items: { data: [{ price: { id: 'price_local_coverage' } }] }, current_period_end: 1999999999 };
    await webhook('evt_local_checkout_insert', 'checkout.session.completed', { client_reference_id: 'stripe-checkout-insert', customer: 'cus_checkout_insert' });
    assert.equal((await orm.select({ stripe_customer_id: schema.stripe_customers.stripe_customer_id }).from(schema.stripe_customers).where(eq(schema.stripe_customers.user_id, 'stripe-checkout-insert')).limit(1))[0].stripe_customer_id, 'cus_checkout_insert', 'Checkout webhook successfully inserts a new mapping');
    await webhook('evt_local_subscription_mapping_insert', 'customer.subscription.created', { ...sub, id: 'sub_mapping_insert', customer: 'cus_subscription_insert', metadata: { userId: 'stripe-subscription-insert' } });
    assert.equal((await orm.select({ stripe_customer_id: schema.stripe_customers.stripe_customer_id }).from(schema.stripe_customers).where(eq(schema.stripe_customers.user_id, 'stripe-subscription-insert')).limit(1))[0].stripe_customer_id, 'cus_subscription_insert', 'Subscription webhook successfully inserts a new mapping');
    assert.equal((await orm.select({ user_id: schema.stripe_subscriptions.user_id }).from(schema.stripe_subscriptions).where(eq(schema.stripe_subscriptions.stripe_subscription_id, 'sub_mapping_insert')).limit(1))[0].user_id, 'stripe-subscription-insert');
    await webhook('evt_local_checkout', 'checkout.session.completed', { client_reference_id: 'billing-coverage', customer: 'cus_local_coverage' });
    await webhook('evt_local_created', 'customer.subscription.created', sub);
    assert.equal(await plan(), 'pro');
    assert.equal((await webhook('evt_local_created', 'customer.subscription.created', sub)).duplicate, true);
    assert.equal(Number((await orm.select({ n: count() }).from(schema.stripe_subscriptions).where(eq(schema.stripe_subscriptions.stripe_subscription_id, 'sub_local')))[0].n), 1);
    await webhook('evt_local_trial', 'customer.subscription.updated', { ...sub, status: 'trialing', cancel_at_period_end: true });
    assert.equal(await plan(), 'pro');
    assert.equal((await orm.select({ cancel_at_period_end: schema.stripe_subscriptions.cancel_at_period_end }).from(schema.stripe_subscriptions).where(eq(schema.stripe_subscriptions.stripe_subscription_id, 'sub_local')).limit(1))[0].cancel_at_period_end, true);
    await webhook('evt_local_deleted', 'customer.subscription.deleted', { ...sub, status: 'canceled', canceled_at: 1788566400 });
    assert.equal(await plan(), 'free');
    await webhook('evt_local_metadata', 'customer.subscription.created', { ...sub, id: 'sub_local_metadata', customer: 'cus_metadata', metadata: { userId: 'billing-coverage' } });
    assert.equal(await plan(), 'pro', 'Metadata fallback creates customer mapping');
    await webhook('evt_local_ignored', 'customer.subscription.created', { id: 'incomplete' });
    assert.equal((await orm.select().from(schema.stripe_subscriptions).where(eq(schema.stripe_subscriptions.stripe_subscription_id, 'incomplete')).limit(1))[0] ?? null, null);
    await webhook('evt_local_unknown', 'unhandled.local.event', {});
    await db.prepare("CREATE TRIGGER coverage_subscription_failure BEFORE UPDATE ON stripe_subscriptions BEGIN SELECT RAISE(ABORT, 'local coverage write failure'); END").run();
    await webhook('evt_local_retry', 'customer.subscription.updated', { ...sub, status: 'past_due', metadata: { userId: 'billing-coverage' } }, 500);
    assert((await orm.select({ error: schema.stripe_webhook_events.error }).from(schema.stripe_webhook_events).where(eq(schema.stripe_webhook_events.id, 'evt_local_retry')).limit(1))[0].error, 'Actual failed D1 mutation is recorded for retry');
    await db.prepare('DROP TRIGGER coverage_subscription_failure').run();
    await webhook('evt_local_retry', 'customer.subscription.updated', { ...sub, status: 'past_due', metadata: { userId: 'billing-coverage' } });
    assert.equal((await orm.select({ error: schema.stripe_webhook_events.error }).from(schema.stripe_webhook_events).where(eq(schema.stripe_webhook_events.id, 'evt_local_retry')).limit(1))[0].error, null);
    checked.push('stripe-mutations');

    const uploadForm = new FormData();
    uploadForm.set('bucket', 'template-files');
    uploadForm.set('file', new File(['local R2 coverage'], 'coverage notes.txt', { type: 'text/plain' }));
    const uploaded = (await request('/api/uploads', { method: 'POST', body: uploadForm })).json();
    assert.match(uploaded.key, /^template-files\/billing-coverage\/[0-9a-f-]+\.txt$/);
    assert.equal(uploaded.fileName, 'coverage notes.txt');
    assert.equal(uploaded.fileSize, 17);
    const uploadRoute = `/api/uploads/file?key=${encodeURIComponent(uploaded.key)}`;
    const downloaded = await request(uploadRoute);
    assert.equal(downloaded.text, 'local R2 coverage');
    assert.equal(downloaded.response.headers.get('content-type'), 'text/plain');
    assert(downloaded.response.headers.get('etag'));
    const uploadHead = await request(uploadRoute, { method: 'HEAD' });
    assert.equal(uploadHead.text, '');
    assert.equal(uploadHead.response.headers.get('content-type'), 'text/plain');
    await request(uploadRoute, { method: 'DELETE' });
    await request(uploadRoute, { status: 404, authenticated: false });
    assert.equal((await uploadsBucket.list()).objects.length, 0, 'Upload CRUD leaves the real local R2 bucket empty');
    checked.push('upload-crud');

    // Valid username is intentional: the browser fixture usernames contain '-'
    // and therefore cannot prove sitemap inclusion under VALID_USERNAME_SQL.
    await orm.insert(schema.templates).values({ id: 'sitemap-coverage', user_id: 'billing-coverage', title: 'Sitemap Fixture', items: '[]', owner_type: 'user', is_public: true, slug: 'sitemap-coverage', category: '["Coverage Unique Category"]', created_at: '2026-09-05' });
    const index1 = (await request('/sitemap.xml')).text;
    assert(index1.includes('/sitemaps/profiles/1.xml'));
    assert.equal((await request('/sitemap.xml')).text, index1, 'Unchanged shard hash preserves revision');
    assert((await request('/sitemaps/profiles/1.xml')).text.includes('/profile/billing_coverage'));
    assert((await request('/sitemaps/templates/1.xml')).text.includes('/profile/billing_coverage/sitemap-coverage'));
    assert((await request('/sitemaps/categories/1.xml')).text.includes('/categories/coverage-unique-category'));
    assert((await request('/sitemaps/pages/1.xml')).text.includes('<urlset'));
    for (const family of ['profiles','templates','categories','pages']) {
      await request(`/sitemaps/${family}/0.xml`, { status: 404 });
      await request(`/sitemaps/${family}/999.xml`, { status: 404 });
      await request(`/sitemaps/${family}/1.xml`, { method: 'POST', status: 405 });
      assert.equal((await request(`/sitemaps/${family}/1.xml`, { method: 'HEAD' })).text, '');
    }
    await request('/sitemap.xml', { method: 'POST', status: 405 });
    await request('/sitemaps/static.xml', { method: 'POST', status: 405 });
    await request('/categories/sitemap.xml', { method: 'POST', status: 405 });
    await request('/sitemaps/static.xml?page=2', { status: 308 });
    await request('/categories/sitemap.xml?page=bad', { status: 308 });
    const [before] = await orm.select({ content_hash: schema.sitemap_shard_revisions.content_hash }).from(schema.sitemap_shard_revisions).where(and(eq(schema.sitemap_shard_revisions.kind, 'templates'), eq(schema.sitemap_shard_revisions.page, 1))).limit(1);
    await orm.update(schema.templates).set({ is_public: false }).where(eq(schema.templates.id, 'sitemap-coverage'));
    assert(!(await request('/sitemaps/templates/1.xml')).text.includes('/profile/billing_coverage/sitemap-coverage'));
    await orm.insert(schema.sitemap_shard_revisions).values({ kind: 'templates', page: 999, content_hash: 'obsolete', revised_at: '2026-09-05' });
    await request('/sitemap.xml');
    assert.notEqual((await orm.select({ content_hash: schema.sitemap_shard_revisions.content_hash }).from(schema.sitemap_shard_revisions).where(and(eq(schema.sitemap_shard_revisions.kind, 'templates'), eq(schema.sitemap_shard_revisions.page, 1))).limit(1))[0].content_hash, before.content_hash);
    assert.equal((await orm.select().from(schema.sitemap_shard_revisions).where(and(eq(schema.sitemap_shard_revisions.kind, 'templates'), eq(schema.sitemap_shard_revisions.page, 999))).limit(1))[0] ?? null, null);
    checked.push('sitemap-queries');
    const { runTemplateLimitCoverage } = await import('./run-template-limit-coverage.mjs');
    const { runTeamQueryCoverage } = await import('./run-team-query-coverage.mjs');
    const templateLimitCoverage = await runTemplateLimitCoverage({mf,db});
    const teamQueryCoverage = await runTeamQueryCoverage({mf,db});
    const { recordRouteScenarios } = await import('./route-coverage-evidence.mjs');
    const details = { externalStripeCalls: calls.length, migrationLedger: ledger.results.map(row => row.name), templateLimitCoverage, teamQueryCoverage, branchInventory: JSON.parse(readFileSync(path.join(repoRoot, 'scripts/data/route-coverage-inventory.json'), 'utf8')).providerAndBranchCoverage };
    recordRouteScenarios(checked, env, details);
    return { scenarios: checked, ...details };
  } finally {
    if (uploadsBucket) {
      let listed = await uploadsBucket.list();
      while (listed.objects.length > 0) {
        await uploadsBucket.delete(listed.objects.map(object => object.key));
        listed = await uploadsBucket.list();
      }
      assert.equal(listed.objects.length, 0, 'All local R2 objects are cleaned before disposal');
    }
    await mf.dispose();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  assert(process.argv[2], 'Pass the disposable Wrangler persistence path');
  console.log(await runAdminBillingSitemapCoverage({ repoRoot, persistPath: path.resolve(process.argv[2]) }));
}
