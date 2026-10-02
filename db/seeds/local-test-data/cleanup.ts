import { inArray, or } from "drizzle-orm";
import {
  account,
  auditEvents,
  checklistRuns,
  entitlementOverrides,
  session,
  teamEntitlementOverrides,
  teamInvites,
  teamMembers,
  teams,
  templateLikes,
  templateVersions,
  templates,
  usageAnalytics,
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
      .delete(checklistRuns)
      .where(
        or(
          inArray(checklistRuns.team_id, testTeamIds),
          inArray(checklistRuns.template_id, TEST_TEAM_TEMPLATE_IDS),
          inArray(checklistRuns.user_id, testUserIds),
          inArray(checklistRuns.id, TEST_RUN_IDS),
        ),
      ),
    db
      .delete(templateVersions)
      .where(
        or(
          inArray(templateVersions.id, TEST_VERSION_IDS),
          inArray(templateVersions.template_id, TEST_TEAM_TEMPLATE_IDS),
          inArray(templateVersions.changed_by_user_id, testUserIds),
        ),
      ),
    db
      .delete(auditEvents)
      .where(
        or(
          inArray(auditEvents.subject_id, TEST_TEAM_IDS),
          inArray(auditEvents.subject_id, testTeamIds),
          inArray(auditEvents.id, TEST_AUDIT_IDS),
          inArray(auditEvents.resource_id, [
            ...TEST_TEAM_IDS,
            ...TEST_TEAM_TEMPLATE_IDS,
            "team-invite-seed-client-john",
          ]),
        ),
      ),
    db
      .delete(templateLikes)
      .where(
        or(
          inArray(templateLikes.user_id, testUserIds),
          inArray(templateLikes.template_id, [...TEST_TEMPLATE_IDS, ...TEST_TEAM_TEMPLATE_IDS]),
        ),
      ),
    db
      .delete(usageAnalytics)
      .where(
        or(
          inArray(usageAnalytics.id, TEST_ANALYTICS_IDS),
          inArray(usageAnalytics.user_id, testUserIds),
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
    db.delete(teamEntitlementOverrides).where(inArray(teamEntitlementOverrides.team_id, testTeamIds)),
    db
      .delete(teamInvites)
      .where(or(inArray(teamInvites.team_id, testTeamIds), inArray(teamInvites.invited_by_user_id, testUserIds))),
    db
      .delete(teamMembers)
      .where(or(inArray(teamMembers.team_id, testTeamIds), inArray(teamMembers.user_id, testUserIds))),
    db.delete(teams).where(inArray(teams.id, testTeamIds)),
    db.delete(entitlementOverrides).where(inArray(entitlementOverrides.user_id, testUserIds)),
    db.delete(session).where(inArray(session.userId, testUserIds)),
    db.delete(account).where(inArray(account.userId, testUserIds)),
    db.delete(users).where(or(inArray(users.id, TEST_USER_IDS), inArray(users.email, TEST_USER_EMAILS))),
  ]);
}
