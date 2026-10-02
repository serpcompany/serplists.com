import { templates } from "../../schema/index";
import type { LocalDb } from "../../../scripts/data/local-d1";
import { personalTemplateItems } from "./template-sections";
import { DAY, json, type SeedClock } from "./values";

export async function seedTestTemplates(db: LocalDb, { at }: SeedClock): Promise<void> {
  const templateRows: (typeof templates.$inferInsert)[] = [
    {
      id: "template-1",
      user_id: "user-1",
      title: "Technical SEO Audit Checklist",
      description: "A practical technical SEO audit you can run in 60-90 minutes.",
      items: json(personalTemplateItems["template-1"]),
      is_public: true,
      category: json(["SEO", "Technical SEO"]),
      tags: json(["audit", "crawl", "indexation", "cwv"]),
      slug: "sample-technical-seo-audit-checklist",
      created_at: at(0),
    },
    {
      id: "template-2",
      user_id: "user-2",
      title: "Keyword Research and Mapping Checklist",
      description: "From seed keywords to keyword-to-page mapping and tracking.",
      items: json(personalTemplateItems["template-2"]),
      is_public: true,
      category: json(["SEO", "Research"]),
      tags: json(["keywords", "intent", "mapping"]),
      slug: "sample-keyword-research-mapping-checklist",
      created_at: at(0),
    },
    {
      id: "template-3",
      user_id: "user-3",
      title: "Content Refresh Checklist",
      description: "A repeatable workflow for updating existing pages and improving rankings.",
      items: json(personalTemplateItems["template-3"]),
      is_public: true,
      category: json(["Content", "SEO"]),
      tags: json(["refresh", "update", "on-page"]),
      slug: "sample-content-refresh-checklist",
      created_at: at(0),
    },
    {
      id: "template-4",
      user_id: "user-1",
      title: "Internal Publishing Checklist",
      description: "Private checklist for shipping an SEO-focused page update.",
      items: json(personalTemplateItems["template-4"]),
      is_public: false,
      category: json(["Operations", "SEO"]),
      tags: json(["publish", "qa", "tracking"]),
      slug: "internal-publishing-checklist",
      created_at: at(0),
    },
    {
      id: "template-5",
      user_id: "user-4",
      title: "Local SEO: Google Business Profile Checklist",
      description: "Basics that move the needle for GBP visibility and conversions.",
      items: json(personalTemplateItems["template-5"]),
      is_public: true,
      category: json(["SEO", "Local SEO"]),
      tags: json(["gbp", "local", "maps"]),
      slug: "sample-local-seo-gbp-checklist",
      created_at: at(0),
    },
    {
      id: "team-template-growth-launch",
      user_id: "user-1",
      title: "Shared Growth Launch Checklist",
      description: "Team-owned checklist used to verify shared editing, runs, and history.",
      items: json([
        {
          id: "team-sec-1",
          title: "Launch Prep",
          items: [
            {
              id: "team-l-1",
              title: "Confirm owners and due date",
              description: "Assign the launch owner and confirm the target date.",
            },
            {
              id: "team-l-2",
              title: "Review SEO requirements",
              description: "Make sure indexation, redirects, metadata, and internal links are ready.",
            },
            {
              id: "team-l-3",
              title: "Create launch run",
              description: "Start a team run so members can verify runner/editor permissions.",
            },
          ],
        },
      ]),
      owner_type: "team",
      team_id: "team-seed-growth",
      created_by_user_id: "user-1",
      updated_by_user_id: "user-3",
      is_public: false,
      category: json(["Operations", "SEO"]),
      tags: json(["team", "launch", "qa"]),
      slug: "shared-growth-launch-checklist",
      version: 2,
      created_at: at(-3 * DAY),
      updated_at: at(-DAY),
    },
    {
      id: "team-template-client-reporting",
      user_id: "user-3",
      title: "Client Reporting QA Checklist",
      description: "Team-owned checklist for verifying limited viewer access and pending invites.",
      items: json([
        {
          id: "client-sec-1",
          title: "Report QA",
          items: [
            {
              id: "client-r-1",
              title: "Confirm ranking screenshots",
              description: "Screenshots match the reporting period.",
            },
            {
              id: "client-r-2",
              title: "Check action item owners",
              description: "Each action has one responsible owner.",
            },
            {
              id: "client-r-3",
              title: "Verify client-ready summary",
              description: "Summary is clear and avoids internal notes.",
            },
          ],
        },
      ]),
      owner_type: "team",
      team_id: "team-seed-client",
      created_by_user_id: "user-3",
      updated_by_user_id: "user-3",
      is_public: false,
      category: json(["Client Work", "SEO"]),
      tags: json(["team", "reporting", "qa"]),
      slug: "client-reporting-qa-checklist",
      created_at: at(-2 * DAY),
      updated_at: at(-2 * DAY),
    },
  ];
  for (const template of templateRows) {
    await db.insert(templates).values(template);
  }
}
