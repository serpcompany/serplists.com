import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import * as schema from '../../db/schema/index';
import { loadCategoryEntries, loadSitemapRevisions } from '../../functions/sitemap/shared';
import { insertAuditEventWhenInviteAccepted, insertTeamMemberWhenInviteAccepted } from '../../functions/api/handlers/teams';
import { createSqliteDrizzleFixture } from '../fixtures/sqlite-drizzle';
import { applyAllLocalSeeds, applyTestDataSeed, cleanupTestDataSeed } from '../../db/seeds/index';

const fixtures: ReturnType<typeof createSqliteDrizzleFixture>[] = [];
afterEach(() => fixtures.splice(0).forEach((fixture) => fixture.close()));

function fixture() {
  const created = createSqliteDrizzleFixture();
  fixtures.push(created);
  return created;
}

describe('installed SQLite proxy Drizzle access', () => {
  it('executes typed inserts, joins, filters, and revision reads against migrated SQLite', async () => {
    const { db } = fixture();
    await db.insert(schema.users).values({
      id: 'owner', email: 'owner@example.invalid', username: 'valid_owner', created_at: '2026-01-01 00:00:00',
    });
    await db.insert(schema.templates).values({
      id: 'public-template', user_id: 'owner', title: 'Public', items: '[]', category: '["SEO"]',
      slug: 'public-template', owner_type: 'user', is_public: true, created_at: '2026-01-02 00:00:00',
    });
    await db.insert(schema.templates).values({
      id: 'private-template', user_id: 'owner', title: 'Private', items: '[]', category: '["Hidden"]',
      slug: 'private-template', owner_type: 'user', is_public: false, created_at: '2026-01-02 00:00:00',
    });

    const categories = await loadCategoryEntries(db as never);
    expect(categories.some((entry) => entry.path === '/categories/seo')).toBe(true);
    expect(categories.some((entry) => entry.path === '/categories/hidden')).toBe(false);
    expect((await loadSitemapRevisions(db as never)).has('templates')).toBe(true);
  });

  it('executes typed conflict updates and deletes without a raw query entrypoint', async () => {
    const { db } = fixture();
    await db.insert(schema.sitemap_shard_revisions).values({
      kind: 'profiles', page: 1, content_hash: 'before', revised_at: '2026-01-01',
    });
    await db.insert(schema.sitemap_shard_revisions).values({
      kind: 'profiles', page: 1, content_hash: 'after', revised_at: '2026-01-02',
    }).onConflictDoUpdate({
      target: [schema.sitemap_shard_revisions.kind, schema.sitemap_shard_revisions.page],
      set: { content_hash: 'after', revised_at: '2026-01-02' },
    });
    expect(await db.select().from(schema.sitemap_shard_revisions)).toEqual([expect.objectContaining({ content_hash: 'after' })]);
    await db.delete(schema.sitemap_shard_revisions).where(eq(schema.sitemap_shard_revisions.kind, 'profiles'));
    expect(await db.select().from(schema.sitemap_shard_revisions)).toEqual([]);
  });

  it('keeps conditional membership and audit inserts atomic at the query-builder seam', async () => {
    const { db } = fixture();
    const acceptedAt = '2026-01-03 00:00:00';
    await db.insert(schema.users).values([
      { id: 'owner', email: 'owner@example.invalid', created_at: '2026-01-01' },
      { id: 'invitee', email: 'invitee@example.invalid', created_at: '2026-01-01' },
    ]);
    await db.insert(schema.teams).values({
      id: 'team', name: 'Team', created_by_user_id: 'owner', created_at: '2026-01-01',
    });
    await db.insert(schema.team_invites).values({
      id: 'invite', team_id: 'team', email: 'invitee@example.invalid', role: 'editor', token_hash: 'hash',
      invited_by_user_id: 'owner', accepted_by_user_id: 'invitee', accepted_at: acceptedAt,
      expires_at: '2027-01-01', created_at: '2026-01-02',
    });
    await insertTeamMemberWhenInviteAccepted(db as never, {
      id: 'member', team_id: 'team', user_id: 'invitee', role: 'editor', status: 'active',
      invited_by_user_id: 'owner', joined_at: acceptedAt, created_at: acceptedAt, updated_at: acceptedAt,
    }, 'invite', 'invitee', acceptedAt);
    await insertAuditEventWhenInviteAccepted(db as never, {
      id: 'audit', actor_user_id: 'invitee', subject_type: 'team', subject_id: 'team',
      resource_type: 'team_invite', resource_id: 'invite', action: 'team_invite.accepted',
      created_at: acceptedAt,
    }, 'invite', 'invitee', acceptedAt);
    expect(await db.select().from(schema.team_members)).toEqual([expect.objectContaining({ id: 'member', role: 'editor' })]);
    expect(await db.select().from(schema.audit_events)).toEqual([expect.objectContaining({ id: 'audit', action: 'team_invite.accepted' })]);

    await insertTeamMemberWhenInviteAccepted(db as never, {
      id: 'wrong-member', team_id: 'team', user_id: 'owner', created_at: acceptedAt,
    }, 'invite', 'owner', acceptedAt);
    expect(await db.select().from(schema.team_members)).toHaveLength(1);
  });

  it('loads and cleans ordinary seed fixtures entirely through typed Drizzle writes', async () => {
    const { db } = fixture();
    const now = new Date('2030-01-01T00:00:00.000Z');
    const inviteExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    await applyAllLocalSeeds(db, now, inviteExpiry);
    expect(await db.select().from(schema.users)).toHaveLength(5);
    expect(await db.select().from(schema.templates)).toHaveLength(8);
    expect(await db.select().from(schema.checklist_runs)).toHaveLength(5);
    const seededUsers = await db.select().from(schema.users);
    expect(seededUsers.filter((user) => user.id.startsWith('user-')).every((user) => user.displayUsername === user.username)).toBe(true);
    const [invite] = await db.select().from(schema.team_invites);
    expect(Date.parse(`${invite.expires_at.replace(' ', 'T')}Z`) - now.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
    await applyAllLocalSeeds(db, now, inviteExpiry);
    expect(await db.select().from(schema.users)).toHaveLength(5);
    await cleanupTestDataSeed(db);
    expect(await db.select().from(schema.users)).toEqual([expect.objectContaining({ id: 'serp-user' })]);
    expect(await db.select().from(schema.templates)).toHaveLength(1);
    expect(await db.select().from(schema.checklist_runs)).toEqual([]);
  });

  it('keeps every canonical row in the default local seed profile deterministic', async () => {
    const { db } = fixture();
    const dump = async () => ({
      users: await db.select().from(schema.users).orderBy(schema.users.id),
      accounts: await db.select().from(schema.account).orderBy(schema.account.id),
      entitlements: await db.select().from(schema.entitlement_overrides).orderBy(schema.entitlement_overrides.user_id),
      teams: await db.select().from(schema.teams).orderBy(schema.teams.id),
      members: await db.select().from(schema.team_members).orderBy(schema.team_members.id),
      invites: await db.select().from(schema.team_invites).orderBy(schema.team_invites.id),
      teamEntitlements: await db.select().from(schema.team_entitlement_overrides).orderBy(schema.team_entitlement_overrides.team_id),
      templates: await db.select().from(schema.templates).orderBy(schema.templates.id),
      versions: await db.select().from(schema.template_versions).orderBy(schema.template_versions.id),
      runs: await db.select().from(schema.checklist_runs).orderBy(schema.checklist_runs.id),
      audit: await db.select().from(schema.audit_events).orderBy(schema.audit_events.id),
      likes: await db.select().from(schema.template_likes).orderBy(schema.template_likes.user_id, schema.template_likes.template_id),
      analytics: await db.select().from(schema.usage_analytics).orderBy(schema.usage_analytics.id),
      sitemapRevisions: await db.select().from(schema.sitemap_revisions).orderBy(schema.sitemap_revisions.kind),
      sitemapProfiles: await db.select().from(schema.sitemap_profile_revisions).orderBy(schema.sitemap_profile_revisions.user_id),
      sitemapOwners: await db.select().from(schema.sitemap_owner_revisions).orderBy(schema.sitemap_owner_revisions.user_id),
      sitemapCategories: await db.select().from(schema.sitemap_category_revisions).orderBy(schema.sitemap_category_revisions.category),
      sitemapShards: await db.select().from(schema.sitemap_shard_revisions).orderBy(schema.sitemap_shard_revisions.kind, schema.sitemap_shard_revisions.page),
    });
    await db.update(schema.sitemap_revisions).set({ revised_at: '2026-09-10T00:00:00.000Z' })
      .where(eq(schema.sitemap_revisions.kind, 'templates'));
    await db.update(schema.sitemap_revisions).set({ revised_at: '2026-09-10T23:00:00-10:00' })
      .where(eq(schema.sitemap_revisions.kind, 'profiles'));
    await db.update(schema.sitemap_revisions).set({ revised_at: '2035-01-01 00:00:00' })
      .where(eq(schema.sitemap_revisions.kind, 'categories'));
    await db.insert(schema.sitemap_shard_revisions).values({
      kind: 'templates', page: 1, content_hash: 'stale-before-seed', revised_at: '2040-01-01 00:00:00',
    });
    await applyAllLocalSeeds(db);
    const first = await dump();
    expect(first.invites[0]?.expires_at).toBe('9999-12-31 23:59:59');
    expect(first.sitemapRevisions.find((row) => row.kind === 'templates')?.revised_at).toBe('2026-09-10 07:02:22');
    expect(first.sitemapRevisions.find((row) => row.kind === 'profiles')?.revised_at).toBe('2026-09-10T23:00:00-10:00');
    expect(first.sitemapRevisions.find((row) => row.kind === 'categories')?.revised_at).toBe('2035-01-01 00:00:00');
    expect(first.sitemapShards).toEqual([]);
    expect([
      ...first.sitemapProfiles,
      ...first.sitemapOwners,
      ...first.sitemapCategories,
    ].every((row) => row.revised_at === '2026-09-10 07:02:22')).toBe(true);
    await applyAllLocalSeeds(db);
    expect(await dump()).toEqual(first);
  });

  it('fails closed when pre-seed sitemap revision state is not a valid instant', async () => {
    const { db } = fixture();
    await db.update(schema.sitemap_revisions).set({ revised_at: 'not-a-timestamp' })
      .where(eq(schema.sitemap_revisions.kind, 'templates'));
    await db.insert(schema.sitemap_shard_revisions).values({
      kind: 'templates', page: 9, content_hash: 'must-survive-rejection', revised_at: '2040-01-01 00:00:00',
    });
    const state = async () => ({
      users: await db.select().from(schema.users),
      templates: await db.select().from(schema.templates),
      teams: await db.select().from(schema.teams),
      revisions: await db.select().from(schema.sitemap_revisions).orderBy(schema.sitemap_revisions.kind),
      shards: await db.select().from(schema.sitemap_shard_revisions).orderBy(schema.sitemap_shard_revisions.kind, schema.sitemap_shard_revisions.page),
    });
    const before = await state();
    await expect(applyTestDataSeed(db)).rejects.toThrow('Invalid sitemap revision timestamp: not-a-timestamp');
    expect(await state()).toEqual(before);
  });
});
