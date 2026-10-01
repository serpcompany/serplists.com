import { audit_events, template_likes, template_versions, usage_analytics } from "../../schema/index";
import type { LocalDb } from "../../../scripts/data/local-d1";
import { DAY, HOUR, json, type SeedClock } from "./values";

export async function seedTestActivity(db: LocalDb, { at }: SeedClock): Promise<void> {
  await db.insert(template_likes).values([
    { user_id: "user-2", template_id: "template-1", created_at: at(0) },
    { user_id: "user-3", template_id: "template-1", created_at: at(0) },
    { user_id: "user-4", template_id: "template-1", created_at: at(0) },
    { user_id: "user-1", template_id: "template-2", created_at: at(0) },
    { user_id: "user-3", template_id: "template-5", created_at: at(0) },
  ]);

  await db.insert(usage_analytics).values([
    {
      id: "analytics-1",
      user_id: "user-1",
      action: "template_created",
      resource_id: "template-1",
      created_at: at(-7 * DAY),
    },
    {
      id: "analytics-2",
      user_id: "user-1",
      action: "checklist_started",
      resource_id: "run-1",
      created_at: at(-2 * DAY),
    },
    {
      id: "analytics-3",
      user_id: "user-2",
      action: "template_created",
      resource_id: "template-2",
      created_at: at(-5 * DAY),
    },
    {
      id: "analytics-4",
      user_id: "user-2",
      action: "checklist_completed",
      resource_id: "run-2",
      created_at: at(-DAY),
    },
  ]);

  await db.insert(template_versions).values([
    {
      id: "team-version-growth-launch-1",
      template_id: "team-template-growth-launch",
      version: 1,
      changed_by_user_id: "user-1",
      subject_type: "team",
      subject_id: "team-seed-growth",
      snapshot_json: json({ title: "Shared Growth Launch Checklist", items: [{ title: "Launch Prep" }] }),
      content_hash: "seed-growth-launch-v1",
      change_summary: "template.created",
      created_at: at(-3 * DAY),
    },
    {
      id: "team-version-growth-launch-2",
      template_id: "team-template-growth-launch",
      version: 2,
      changed_by_user_id: "user-3",
      subject_type: "team",
      subject_id: "team-seed-growth",
      snapshot_json: json({
        title: "Shared Growth Launch Checklist",
        items: [
          {
            title: "Launch Prep",
            items: [
              "Confirm owners and due date",
              "Review SEO requirements",
              "Create launch run",
            ],
          },
        ],
      }),
      content_hash: "seed-growth-launch-v2",
      change_summary: "template.updated",
      created_at: at(-DAY),
    },
    {
      id: "team-version-client-reporting-1",
      template_id: "team-template-client-reporting",
      version: 1,
      changed_by_user_id: "user-3",
      subject_type: "team",
      subject_id: "team-seed-client",
      snapshot_json: json({ title: "Client Reporting QA Checklist", items: [{ title: "Report QA" }] }),
      content_hash: "seed-client-reporting-v1",
      change_summary: "template.created",
      created_at: at(-2 * DAY),
    },
  ]);

  await db.insert(audit_events).values([
    {
      id: "audit-team-growth-created",
      actor_user_id: "user-1",
      subject_type: "team",
      subject_id: "team-seed-growth",
      resource_type: "team",
      resource_id: "team-seed-growth",
      action: "team.created",
      after_json: json({ name: "SERP Growth Team", slug: "serp-growth-team" }),
      metadata_json: json({ source: "seed" }),
      user_agent: "seed",
      created_at: at(-5 * DAY),
    },
    {
      id: "audit-template-growth-created",
      actor_user_id: "user-1",
      subject_type: "team",
      subject_id: "team-seed-growth",
      resource_type: "template",
      resource_id: "team-template-growth-launch",
      action: "template.created",
      after_json: json({ title: "Shared Growth Launch Checklist" }),
      metadata_json: json({ source: "seed" }),
      user_agent: "seed",
      created_at: at(-3 * DAY),
    },
    {
      id: "audit-template-growth-updated",
      actor_user_id: "user-3",
      subject_type: "team",
      subject_id: "team-seed-growth",
      resource_type: "template",
      resource_id: "team-template-growth-launch",
      action: "template.updated",
      before_json: json({ title: "Shared Growth Launch Checklist" }),
      after_json: json({
        title: "Shared Growth Launch Checklist",
        reviewedBy: "jane@test.com",
      }),
      diff_json: json({ updated_by_user_id: "user-3" }),
      metadata_json: json({ source: "seed" }),
      user_agent: "seed",
      created_at: at(-DAY),
    },
    {
      id: "audit-team-client-created",
      actor_user_id: "user-3",
      subject_type: "team",
      subject_id: "team-seed-client",
      resource_type: "team",
      resource_id: "team-seed-client",
      action: "team.created",
      after_json: json({ name: "Local SEO Client Team", slug: "local-seo-client-team" }),
      metadata_json: json({ source: "seed" }),
      user_agent: "seed",
      created_at: at(-4 * DAY),
    },
    {
      id: "audit-team-client-invite-john",
      actor_user_id: "user-3",
      subject_type: "team",
      subject_id: "team-seed-client",
      resource_type: "team_invite",
      resource_id: "team-invite-seed-client-john",
      action: "team_invite.created",
      after_json: json({ email: "john@test.com", role: "editor" }),
      metadata_json: json({
        source: "seed",
        inviteUrlPath: "/team-invites/dev-client-john-invite/",
      }),
      user_agent: "seed",
      created_at: at(-12 * HOUR),
    },
  ]);
}
