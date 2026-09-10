import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import * as schema from '../../db/schema/index';
import { loadCategoryEntries, loadSitemapRevisions } from '../../functions/sitemap/shared';
import { insertAuditEventWhenInviteAccepted, insertTeamMemberWhenInviteAccepted } from '../../functions/api/handlers/teams';
import { createSqliteDrizzleFixture } from '../fixtures/sqlite-drizzle';
import { applyAllLocalSeeds, cleanupTestDataSeed } from '../../db/seeds/index';

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
    await applyAllLocalSeeds(db, now);
    expect(await db.select().from(schema.users)).toHaveLength(5);
    expect(await db.select().from(schema.templates)).toHaveLength(8);
    expect(await db.select().from(schema.checklist_runs)).toHaveLength(5);
    const seededUsers = await db.select().from(schema.users);
    expect(seededUsers.filter((user) => user.id.startsWith('user-')).every((user) => user.displayUsername === user.username)).toBe(true);
    const [invite] = await db.select().from(schema.team_invites);
    expect(Date.parse(`${invite.expires_at.replace(' ', 'T')}Z`) - now.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
    await applyAllLocalSeeds(db, now);
    expect(await db.select().from(schema.users)).toHaveLength(5);
    await cleanupTestDataSeed(db);
    expect(await db.select().from(schema.users)).toEqual([expect.objectContaining({ id: 'serp-user' })]);
    expect(await db.select().from(schema.templates)).toHaveLength(1);
    expect(await db.select().from(schema.checklist_runs)).toEqual([]);
  });
});
