import { and, eq, inArray, like, or } from 'drizzle-orm';
import * as schema from '../schema/index';
import { createSQLiteProxy } from '../../scripts/data/sqlite-proxy';
import testData from './data/test-data.json';
import officialTemplates from './data/official-templates.json';
import officialLogin from './data/official-local-login.json';

type SeedDb = ReturnType<typeof createSQLiteProxy>;
const DEFAULT_SEED_CLOCK = new Date('2026-09-10T07:02:22.000Z');
// Local demo data is replayable indefinitely; semantic expiry tests inject a
// finite clock and expiry explicitly.
const LOCAL_SEED_NON_EXPIRING_INVITE = new Date('9999-12-31T23:59:59.000Z');
const FIXTURE_CAPTURE_CLOCK = Date.parse('2026-09-10T07:02:22.000Z');
const teamIds = ['team-seed-growth', 'team-seed-client'];
const teamTemplateIds = ['team-template-growth-launch', 'team-template-client-reporting'];
const seedUserIds = [...new Set([...testData.users, ...officialTemplates.users, ...officialLogin.users].map((row) => row.id))];
const seedCategories = [...new Set([...testData.templates, ...officialTemplates.templates]
  .map((row) => row.category).filter((category): category is string => Boolean(category?.trim())))];
const optionalDate = (value: unknown) => typeof value === 'number' ? new Date(value) : null;
const sqliteTimestamp = (date: Date) => date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
const users = (rows: readonly Record<string, unknown>[]) => rows.map((row) => ({
  ...row,
  displayUsername: row.display_username ?? null,
  email_verified: Boolean(row.email_verified),
  auth_created_at: optionalDate(row.auth_created_at),
  auth_updated_at: optionalDate(row.auth_updated_at),
})) as unknown as typeof schema.users.$inferInsert[];
const accounts = (rows: typeof testData.account | typeof officialLogin.account) => rows.map((row) => ({
  id: row.id,
  accountId: row.account_id,
  providerId: row.provider_id,
  userId: row.user_id,
  accessToken: row.access_token,
  refreshToken: row.refresh_token,
  idToken: row.id_token,
  accessTokenExpiresAt: optionalDate(row.access_token_expires_at),
  refreshTokenExpiresAt: optionalDate(row.refresh_token_expires_at),
  scope: row.scope,
  password: row.password,
  createdAt: optionalDate(row.created_at)!,
  updatedAt: optionalDate(row.updated_at)!,
})) satisfies typeof schema.account.$inferInsert[];
const templates = (rows: typeof testData.templates | typeof officialTemplates.templates) => rows.map((row) => ({
  ...row,
  is_public: Boolean(row.is_public),
})) as typeof schema.templates.$inferInsert[];
const runs = (rows: typeof testData.checklist_runs) => rows.map((row) => ({
  ...row,
  is_public: Boolean(row.is_public),
})) as typeof schema.checklist_runs.$inferInsert[];
const shiftSeedRows = <Row extends Record<string, unknown>>(rows: readonly Row[], now: Date): Row[] => {
  const delta = now.getTime() - FIXTURE_CAPTURE_CLOCK;
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (!key.endsWith('_at') || value == null) return [key, value];
    if (typeof value === 'number') return [key, value + delta];
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}[ T]/.test(value)) {
      const parsed = Date.parse(`${value.replace(' ', 'T').replace(/Z$/, '')}Z`);
      if (Number.isFinite(parsed)) return [key, sqliteTimestamp(new Date(parsed + delta))];
    }
    return [key, value];
  })) as Row);
};

async function normalizeLocalSeedSitemapRevisions(db: SeedDb, now: Date) {
  const revised_at = sqliteTimestamp(now);
  await db.update(schema.sitemap_revisions).set({ revised_at });
  await db.update(schema.sitemap_profile_revisions).set({ revised_at })
    .where(inArray(schema.sitemap_profile_revisions.user_id, seedUserIds));
  await db.update(schema.sitemap_owner_revisions).set({ revised_at })
    .where(inArray(schema.sitemap_owner_revisions.user_id, seedUserIds));
  if (seedCategories.length) {
    await db.update(schema.sitemap_category_revisions).set({ revised_at })
      .where(inArray(schema.sitemap_category_revisions.category, seedCategories));
  }
}

export async function cleanupTestDataSeed(db: SeedDb) {
  const testUsers = await db.select({ id: schema.users.id }).from(schema.users).where(like(schema.users.email, '%@test.com'));
  const userIds = testUsers.map(({ id }) => id);
  const userPredicate = userIds.length ? inArray(schema.users.id, userIds) : undefined;
  await db.delete(schema.checklist_runs).where(or(inArray(schema.checklist_runs.team_id, teamIds), inArray(schema.checklist_runs.template_id, teamTemplateIds), ...(userIds.length ? [inArray(schema.checklist_runs.user_id, userIds)] : [])));
  await db.delete(schema.template_versions).where(inArray(schema.template_versions.template_id, teamTemplateIds));
  await db.delete(schema.audit_events).where(or(inArray(schema.audit_events.subject_id, teamIds), inArray(schema.audit_events.resource_id, [...teamIds, ...teamTemplateIds, 'team-invite-seed-client-john'])));
  if (userIds.length) {
    await db.delete(schema.template_likes).where(inArray(schema.template_likes.user_id, userIds));
    await db.delete(schema.usage_analytics).where(inArray(schema.usage_analytics.user_id, userIds));
  }
  await db.delete(schema.templates).where(or(inArray(schema.templates.team_id, teamIds), ...(userIds.length ? [inArray(schema.templates.user_id, userIds)] : [])));
  await db.delete(schema.team_entitlement_overrides).where(inArray(schema.team_entitlement_overrides.team_id, teamIds));
  await db.delete(schema.team_invites).where(inArray(schema.team_invites.team_id, teamIds));
  await db.delete(schema.team_members).where(or(inArray(schema.team_members.team_id, teamIds), ...(userIds.length ? [inArray(schema.team_members.user_id, userIds)] : [])));
  await db.delete(schema.teams).where(inArray(schema.teams.id, teamIds));
  if (userIds.length) {
    await db.delete(schema.entitlement_overrides).where(inArray(schema.entitlement_overrides.user_id, userIds));
    await db.delete(schema.session).where(inArray(schema.session.userId, userIds));
    await db.delete(schema.account).where(inArray(schema.account.userId, userIds));
    if (userPredicate) await db.delete(schema.users).where(userPredicate);
  }
}

export async function applyTestDataSeed(db: SeedDb, now = DEFAULT_SEED_CLOCK, inviteExpiry = LOCAL_SEED_NON_EXPIRING_INVITE) {
  await cleanupTestDataSeed(db);
  await db.insert(schema.users).values(users(shiftSeedRows(testData.users, now)));
  await db.insert(schema.account).values(accounts(shiftSeedRows(testData.account, now)));
  await db.insert(schema.entitlement_overrides).values(shiftSeedRows(testData.entitlement_overrides, now) as typeof schema.entitlement_overrides.$inferInsert[]);
  await db.insert(schema.teams).values(shiftSeedRows(testData.teams, now) as typeof schema.teams.$inferInsert[]);
  await db.insert(schema.team_members).values(shiftSeedRows(testData.team_members, now) as typeof schema.team_members.$inferInsert[]);
  await db.insert(schema.team_invites).values(shiftSeedRows(testData.team_invites, now).map((invite) => ({
    ...invite,
    expires_at: sqliteTimestamp(inviteExpiry),
    created_at: sqliteTimestamp(new Date(now.getTime() - 12 * 60 * 60 * 1000)),
    updated_at: sqliteTimestamp(new Date(now.getTime() - 12 * 60 * 60 * 1000)),
  })) as typeof schema.team_invites.$inferInsert[]);
  await db.insert(schema.team_entitlement_overrides).values(shiftSeedRows(testData.team_entitlement_overrides, now) as typeof schema.team_entitlement_overrides.$inferInsert[]);
  await db.insert(schema.templates).values(templates(shiftSeedRows(testData.templates, now)));
  await db.insert(schema.template_versions).values(shiftSeedRows(testData.template_versions, now) as typeof schema.template_versions.$inferInsert[]);
  await db.insert(schema.checklist_runs).values(runs(shiftSeedRows(testData.checklist_runs, now)));
  await db.insert(schema.audit_events).values(shiftSeedRows(testData.audit_events, now) as typeof schema.audit_events.$inferInsert[]);
  await db.insert(schema.template_likes).values(shiftSeedRows(testData.template_likes, now) as typeof schema.template_likes.$inferInsert[]);
  await db.insert(schema.usage_analytics).values(shiftSeedRows(testData.usage_analytics, now) as typeof schema.usage_analytics.$inferInsert[]);
  await normalizeLocalSeedSitemapRevisions(db, now);
}

export async function applyOfficialTemplatesSeed(db: SeedDb, now = DEFAULT_SEED_CLOCK) {
  const timestamp = sqliteTimestamp(now);
  await db.insert(schema.users).values(users(officialTemplates.users).map((row) => ({ ...row, created_at: timestamp }))).onConflictDoNothing();
  await db.insert(schema.templates).values(templates(officialTemplates.templates).map((row) => ({ ...row, created_at: timestamp }))).onConflictDoNothing();
  await normalizeLocalSeedSitemapRevisions(db, now);
}

export async function applyOfficialLocalLoginSeed(db: SeedDb, now = DEFAULT_SEED_CLOCK) {
  const account = accounts(officialLogin.account)[0];
  const user = users(officialLogin.users)[0];
  const entitlement = officialLogin.entitlement_overrides[0] as typeof schema.entitlement_overrides.$inferInsert;
  await db.delete(schema.account).where(and(eq(schema.account.userId, 'serp-user'), eq(schema.account.providerId, 'credential')));
  await db.insert(schema.account).values({ ...account, createdAt: now, updatedAt: now });
  await db.update(schema.users).set({
    password_hash: user.password_hash,
    email_verified: user.email_verified,
    auth_updated_at: now,
    updated_at: sqliteTimestamp(now),
  }).where(eq(schema.users.id, 'serp-user'));
  const currentEntitlement = { ...entitlement, created_at: sqliteTimestamp(now), updated_at: sqliteTimestamp(now) };
  await db.insert(schema.entitlement_overrides).values(currentEntitlement).onConflictDoUpdate({
    target: schema.entitlement_overrides.user_id,
    set: { plan: currentEntitlement.plan, expires_at: currentEntitlement.expires_at, note: currentEntitlement.note, updated_at: currentEntitlement.updated_at },
  });
  await normalizeLocalSeedSitemapRevisions(db, now);
}

export async function applyAllLocalSeeds(db: SeedDb, now = DEFAULT_SEED_CLOCK, inviteExpiry = LOCAL_SEED_NON_EXPIRING_INVITE) {
  await applyTestDataSeed(db, now, inviteExpiry);
  await applyOfficialTemplatesSeed(db, now);
  await applyOfficialLocalLoginSeed(db, now);
}

export async function applyRouteCoverageSeed(db: SeedDb) {
  const createdAt = '2026-09-05';
  const authAt = new Date(1788566400000);
  const password = '$2b$10$ai6w4pGPSwjTsx8h9eRuHOHz956SooVhr7NpOMxLCB.v4MhZfVnfa';
  const principals = ['owner', 'admin', 'editor', 'runner', 'viewer'].map((role) => ({
    id: `coverage-${role}`, email: `coverage-${role}@e2e.local`, name: `Coverage ${role[0].toUpperCase()}${role.slice(1)}`,
    username: `coverage-${role}`, email_verified: true, created_at: createdAt, auth_created_at: authAt, auth_updated_at: authAt,
  }));
  const legacy = { id: 'coverage-legacy', email: 'coverage-legacy@e2e.local', name: 'Legacy Fixture', username: 'coverage-legacy', email_verified: true, created_at: createdAt, auth_created_at: authAt, auth_updated_at: authAt };
  await db.insert(schema.users).values([...principals, legacy]);
  await db.insert(schema.account).values([...principals, legacy].map((user) => ({
    id: `${user.id}-credential`, accountId: user.id, providerId: 'credential', userId: user.id, password, createdAt: authAt, updatedAt: authAt,
  })));
  await db.insert(schema.entitlement_overrides).values({ user_id: 'coverage-owner', plan: 'pro', created_at: createdAt, updated_at: createdAt });
  await db.insert(schema.teams).values({ id: 'coverage-team', name: 'Coverage Team', slug: 'coverage-team', created_by_user_id: 'coverage-owner', billing_owner_user_id: 'coverage-owner', created_at: createdAt });
  await db.insert(schema.team_members).values(principals.map((user) => ({
    id: `${user.id}-membership`, team_id: 'coverage-team', user_id: user.id, role: user.id.slice('coverage-'.length), status: 'active', created_at: createdAt,
  })));
  await db.insert(schema.team_entitlement_overrides).values({ team_id: 'coverage-team', plan: 'team', created_at: createdAt, updated_at: createdAt });
  const standardItems = '[{"id":"section","title":"Coverage Section","items":[{"id":"item","title":"Coverage Item"}]}]';
  await db.insert(schema.templates).values([
    { id: 'coverage-public', user_id: 'coverage-owner', title: 'Coverage Public Template', description: 'Route fixture', items: standardItems, owner_type: 'user', is_public: true, slug: 'coverage-public', category: '["Operations"]', created_at: createdAt },
    { id: 'coverage-private', user_id: 'coverage-owner', title: 'Coverage Private Template', description: 'Route fixture', items: standardItems, owner_type: 'user', is_public: false, slug: 'coverage-private', category: '["Operations"]', created_at: createdAt },
    { id: 'coverage-team-template', user_id: 'coverage-owner', title: 'Coverage Team Template', items: '[]', owner_type: 'team', team_id: 'coverage-team', created_at: createdAt },
    { id: 'legacy-invalid-template', user_id: 'coverage-legacy', title: 'Invalid Legacy Template', items: '[{"id":"s","items":[{"id":"i","title":"Bad image","contents":[{"type":"image","value":{"url":"https://example.test/image"}}]}]}]', owner_type: 'user', is_public: false, slug: 'legacy-invalid-template', created_at: createdAt },
    { id: 'legacy-valid-template', user_id: 'coverage-legacy', title: 'Valid Legacy Template', items: '[{"title":"Legacy task","completed":true,"contents":[{"type":"text","value":"Legacy text remains readable"}]}]', owner_type: 'user', is_public: false, slug: 'legacy-valid-template', created_at: createdAt },
    { id: 'legacy-duplicate-template', user_id: 'coverage-legacy', title: 'Duplicate Legacy Template', items: '[{"id":"s","title":"Section","items":[{"id":"i","title":"Item","contents":[{"id":"c","type":"text","value":"A","extension":"A"},{"id":"c","type":"text","value":"B","extension":"B"}]}]}]', owner_type: 'user', is_public: false, slug: 'legacy-duplicate-template', created_at: createdAt },
  ]);
  await db.insert(schema.checklist_runs).values([
    { id: 'legacy-invalid-run', user_id: 'coverage-legacy', title: 'Invalid Legacy Run', items: '[{"id":"s","items":[{"id":"i","contents":[{"type":"text","value":{"bad":true}}]}]}]', status: 'in_progress', started_at: createdAt, created_at: createdAt },
    { id: 'legacy-valid-run', user_id: 'coverage-legacy', title: 'Valid Legacy Run', items: '[{"title":"Legacy run task","completed":true}]', status: 'in_progress', started_at: createdAt, created_at: createdAt },
    { id: 'coverage-run', user_id: 'coverage-owner', template_id: 'coverage-public', title: 'Coverage Run', items: '[{"id":"section","title":"Coverage Section","items":[{"id":"item","title":"Coverage Item","isCompleted":false}]}]', is_public: true, share_token: 'coverage-share', status: 'in_progress', started_at: createdAt, created_at: createdAt },
  ]);
}
