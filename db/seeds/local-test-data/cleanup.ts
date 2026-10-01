import { inArray, or } from "drizzle-orm";
import {
  account,
  audit_events,
  checklist_runs,
  entitlement_overrides,
  session,
  team_entitlement_overrides,
  team_invites,
  team_members,
  teams,
  template_likes,
  template_versions,
  templates,
  usage_analytics,
  users,
} from "../../schema/index";
import type { LocalDb } from "../../../scripts/data/local-d1";
import {
  TEST_ANALYTICS_IDS,
  TEST_AUDIT_IDS,
  TEST_RUN_IDS,
  TEST_TEAM_IDS,
  TEST_TEAM_TEMPLATE_IDS,
  TEST_TEMPLATE_IDS,
  TEST_USER_EMAILS,
  TEST_USER_IDS,
  TEST_VERSION_IDS,
} from "./ids";

function ownedTestUserIds(db: LocalDb) {
  return db
    .select({ id: users.id })
    .from(users)
    .where(or(inArray(users.id, TEST_USER_IDS), inArray(users.email, TEST_USER_EMAILS)));
}

function fixtureAndTestUserCreatedTeamIds(db: LocalDb) {
  return db
    .select({ id: teams.id })
    .from(teams)
    .where(or(inArray(teams.id, TEST_TEAM_IDS), inArray(teams.created_by_user_id, ownedTestUserIds(db))));
}

export async function cleanupLocalTestData(db: LocalDb): Promise<void> {
  const testUserIds = ownedTestUserIds(db);
  const testTeamIds = fixtureAndTestUserCreatedTeamIds(db);

  await db.batch([
    db
      .delete(checklist_runs)
      .where(
        or(
          inArray(checklist_runs.team_id, testTeamIds),
          inArray(checklist_runs.template_id, TEST_TEAM_TEMPLATE_IDS),
          inArray(checklist_runs.user_id, testUserIds),
          inArray(checklist_runs.id, TEST_RUN_IDS),
        ),
      ),
    db
      .delete(template_versions)
      .where(
        or(
          inArray(template_versions.id, TEST_VERSION_IDS),
          inArray(template_versions.template_id, TEST_TEAM_TEMPLATE_IDS),
          inArray(template_versions.changed_by_user_id, testUserIds),
        ),
      ),
    db
      .delete(audit_events)
      .where(
        or(
          inArray(audit_events.subject_id, TEST_TEAM_IDS),
          inArray(audit_events.subject_id, testTeamIds),
          inArray(audit_events.id, TEST_AUDIT_IDS),
          inArray(audit_events.resource_id, [
            ...TEST_TEAM_IDS,
            ...TEST_TEAM_TEMPLATE_IDS,
            "team-invite-seed-client-john",
          ]),
        ),
      ),
    db
      .delete(template_likes)
      .where(
        or(
          inArray(template_likes.user_id, testUserIds),
          inArray(template_likes.template_id, [...TEST_TEMPLATE_IDS, ...TEST_TEAM_TEMPLATE_IDS]),
        ),
      ),
    db
      .delete(usage_analytics)
      .where(
        or(
          inArray(usage_analytics.id, TEST_ANALYTICS_IDS),
          inArray(usage_analytics.user_id, testUserIds),
        ),
      ),
    db
      .delete(templates)
      .where(
        or(
          inArray(templates.id, [...TEST_TEMPLATE_IDS, ...TEST_TEAM_TEMPLATE_IDS]),
          inArray(templates.team_id, testTeamIds),
          inArray(templates.user_id, testUserIds),
        ),
      ),
    db.delete(team_entitlement_overrides).where(inArray(team_entitlement_overrides.team_id, testTeamIds)),
    db
      .delete(team_invites)
      .where(or(inArray(team_invites.team_id, testTeamIds), inArray(team_invites.invited_by_user_id, testUserIds))),
    db
      .delete(team_members)
      .where(or(inArray(team_members.team_id, testTeamIds), inArray(team_members.user_id, testUserIds))),
    db.delete(teams).where(inArray(teams.id, testTeamIds)),
    db.delete(entitlement_overrides).where(inArray(entitlement_overrides.user_id, testUserIds)),
    db.delete(session).where(inArray(session.userId, testUserIds)),
    db.delete(account).where(inArray(account.userId, testUserIds)),
    db.delete(users).where(or(inArray(users.id, TEST_USER_IDS), inArray(users.email, TEST_USER_EMAILS))),
  ]);
}
