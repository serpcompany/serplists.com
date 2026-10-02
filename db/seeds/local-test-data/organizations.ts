import { teamEntitlementOverrides, teamInvites, teamMembers, teams } from "../../schema/index";
import type { LocalDb } from "../../../scripts/data/local-d1";
import { DAY, HOUR, type SeedClock } from "./values";

export async function seedTestOrganizations(db: LocalDb, { at }: SeedClock): Promise<void> {
  await db.insert(teams).values([
    {
      id: "team-seed-growth",
      name: "SERP Growth Team",
      slug: "serp-growth-team",
      billing_owner_user_id: "user-1",
      created_by_user_id: "user-1",
      created_at: at(-5 * DAY),
      updated_at: at(-DAY),
    },
    {
      id: "team-seed-client",
      name: "Local SEO Client Team",
      slug: "local-seo-client-team",
      billing_owner_user_id: "user-3",
      created_by_user_id: "user-3",
      created_at: at(-4 * DAY),
      updated_at: at(-2 * DAY),
    },
  ]);

  await db.insert(teamMembers).values([
    {
      id: "team-member-growth-owner-admin",
      team_id: "team-seed-growth",
      user_id: "user-1",
      role: "owner",
      status: "active",
      joined_at: at(-5 * DAY),
      created_at: at(-5 * DAY),
      updated_at: at(-5 * DAY),
    },
    {
      id: "team-member-growth-admin-jane",
      team_id: "team-seed-growth",
      user_id: "user-3",
      role: "admin",
      status: "active",
      invited_by_user_id: "user-1",
      joined_at: at(-4 * DAY),
      created_at: at(-4 * DAY),
      updated_at: at(-3 * DAY),
    },
    {
      id: "team-member-growth-editor-john",
      team_id: "team-seed-growth",
      user_id: "user-2",
      role: "editor",
      status: "active",
      invited_by_user_id: "user-1",
      joined_at: at(-3 * DAY),
      created_at: at(-3 * DAY),
      updated_at: at(-3 * DAY),
    },
    {
      id: "team-member-growth-runner-bob",
      team_id: "team-seed-growth",
      user_id: "user-4",
      role: "runner",
      status: "active",
      invited_by_user_id: "user-1",
      joined_at: at(-2 * DAY),
      created_at: at(-2 * DAY),
      updated_at: at(-2 * DAY),
    },
    {
      id: "team-member-client-owner-jane",
      team_id: "team-seed-client",
      user_id: "user-3",
      role: "owner",
      status: "active",
      joined_at: at(-4 * DAY),
      created_at: at(-4 * DAY),
      updated_at: at(-4 * DAY),
    },
    {
      id: "team-member-client-viewer-bob",
      team_id: "team-seed-client",
      user_id: "user-4",
      role: "viewer",
      status: "active",
      invited_by_user_id: "user-3",
      joined_at: at(-DAY),
      created_at: at(-DAY),
      updated_at: at(-DAY),
    },
  ]);

  await db.insert(teamInvites).values({
    id: "team-invite-seed-client-john",
    team_id: "team-seed-client",
    email: "john@test.com",
    role: "editor",
    token_hash: "0de44e8d656bd6e84c00315f9bbb63b42706edd10a8ad2281e56439ce29bb33e",
    invited_by_user_id: "user-3",
    expires_at: at(30 * DAY),
    created_at: at(-12 * HOUR),
    updated_at: at(-12 * HOUR),
  });

  await db.insert(teamEntitlementOverrides).values({
    team_id: "team-seed-growth",
    plan: "team",
    note: "Seeded premium team workspace for local verification",
    created_at: at(0),
    updated_at: at(0),
  });
}
