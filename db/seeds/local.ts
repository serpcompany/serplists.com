import { and, eq, inArray, or } from "drizzle-orm";
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
} from "../schema/index";
import type { LocalDb } from "../../scripts/data/local-d1";

export const TEST_USER_IDS = ["user-1", "user-2", "user-3", "user-4"] as const;
export const TEST_USER_EMAILS = [
  "admin@test.com",
  "john@test.com",
  "jane@test.com",
  "bob@test.com",
] as const;
export const TEST_TEAM_IDS = ["team-seed-growth", "team-seed-client"] as const;
export const TEST_TEMPLATE_IDS = [
  "template-1",
  "template-2",
  "template-3",
  "template-4",
  "template-5",
] as const;
export const TEST_TEAM_TEMPLATE_IDS = [
  "team-template-growth-launch",
  "team-template-client-reporting",
] as const;
export const TEST_RUN_IDS = [
  "run-1",
  "run-2",
  "run-3",
  "team-run-growth-launch",
  "team-run-client-reporting",
] as const;
const TEST_ANALYTICS_IDS = ["analytics-1", "analytics-2", "analytics-3", "analytics-4"] as const;
const TEST_VERSION_IDS = [
  "team-version-growth-launch-1",
  "team-version-growth-launch-2",
  "team-version-client-reporting-1",
] as const;
const TEST_AUDIT_IDS = [
  "audit-team-growth-created",
  "audit-template-growth-created",
  "audit-template-growth-updated",
  "audit-team-client-created",
  "audit-team-client-invite-john",
] as const;

export const DEV_PASSWORD_HASH =
  "$2b$10$ai6w4pGPSwjTsx8h9eRuHOHz956SooVhr7NpOMxLCB.v4MhZfVnfa";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

function sqliteTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function ownedTestUserIds(db: LocalDb) {
  return db
    .select({ id: users.id })
    .from(users)
    .where(or(inArray(users.id, TEST_USER_IDS), inArray(users.email, TEST_USER_EMAILS)));
}

export async function cleanupLocalTestData(db: LocalDb): Promise<void> {
  const testUserIds = ownedTestUserIds(db);

  await db
    .delete(checklist_runs)
    .where(
      or(
        inArray(checklist_runs.team_id, TEST_TEAM_IDS),
        inArray(checklist_runs.template_id, TEST_TEAM_TEMPLATE_IDS),
        inArray(checklist_runs.user_id, testUserIds),
        inArray(checklist_runs.id, TEST_RUN_IDS),
      ),
    );
  await db
    .delete(template_versions)
    .where(
      or(
        inArray(template_versions.id, TEST_VERSION_IDS),
        inArray(template_versions.template_id, TEST_TEAM_TEMPLATE_IDS),
      ),
    );
  await db
    .delete(audit_events)
    .where(
      or(
        inArray(audit_events.subject_id, TEST_TEAM_IDS),
        inArray(audit_events.id, TEST_AUDIT_IDS),
        inArray(audit_events.resource_id, [
          ...TEST_TEAM_IDS,
          ...TEST_TEAM_TEMPLATE_IDS,
          "team-invite-seed-client-john",
        ]),
      ),
    );
  await db
    .delete(template_likes)
    .where(
      or(
        inArray(template_likes.user_id, testUserIds),
        inArray(template_likes.template_id, [...TEST_TEMPLATE_IDS, ...TEST_TEAM_TEMPLATE_IDS]),
      ),
    );
  await db
    .delete(usage_analytics)
    .where(
      or(
        inArray(usage_analytics.id, TEST_ANALYTICS_IDS),
        inArray(usage_analytics.user_id, testUserIds),
      ),
    );
  await db
    .delete(templates)
    .where(
      or(
        inArray(templates.id, [...TEST_TEMPLATE_IDS, ...TEST_TEAM_TEMPLATE_IDS]),
        inArray(templates.team_id, TEST_TEAM_IDS),
        inArray(templates.user_id, testUserIds),
      ),
    );
  await db
    .delete(team_entitlement_overrides)
    .where(inArray(team_entitlement_overrides.team_id, TEST_TEAM_IDS));
  await db.delete(team_invites).where(inArray(team_invites.team_id, TEST_TEAM_IDS));
  await db
    .delete(team_members)
    .where(or(inArray(team_members.team_id, TEST_TEAM_IDS), inArray(team_members.user_id, testUserIds)));
  await db.delete(teams).where(inArray(teams.id, TEST_TEAM_IDS));
  await db.delete(entitlement_overrides).where(inArray(entitlement_overrides.user_id, testUserIds));
  await db.delete(session).where(inArray(session.userId, testUserIds));
  await db.delete(account).where(inArray(account.userId, testUserIds));
  await db
    .delete(users)
    .where(or(inArray(users.id, TEST_USER_IDS), inArray(users.email, TEST_USER_EMAILS)));
}

const personalTemplateItems = {
  "template-1": [
    {
      id: "sec-1",
      title: "Crawl and Indexation",
      items: [
        {
          id: "t-1",
          title: "Check robots.txt and meta robots",
          description: "Confirm important sections are crawlable and not accidentally blocked.",
          contents: [
            {
              type: "text",
              value:
                "- Verify `robots.txt` returns `200` and is reachable.\n- Confirm important paths are not disallowed.\n- Spot check key pages for `meta robots` (noindex/nofollow).\n\nUseful: https://developers.google.com/search/docs/crawling-indexing/robots/intro",
            },
          ],
        },
        {
          id: "t-2",
          title: "Validate XML sitemap(s)",
          description: "Make sure sitemaps are clean and represent the URLs you want indexed.",
          contents: [
            {
              type: "text",
              value:
                "- Confirm sitemap URL(s) are listed in `robots.txt`.\n- Ensure the sitemap has only canonical, indexable URLs.\n\nSpec: https://www.sitemaps.org/protocol.html",
            },
          ],
        },
      ],
    },
    {
      id: "sec-2",
      title: "Performance and Core Web Vitals",
      items: [
        {
          id: "t-3",
          title: "Run a quick PageSpeed test",
          description: "Check LCP, INP, CLS on mobile for your top pages.",
          contents: [{ type: "embed", value: "https://pagespeed.web.dev/" }],
        },
        {
          id: "t-4",
          title: "Fix obvious render-blocking issues",
          description: "Biggest wins are usually images, fonts, and unused JS/CSS.",
          contents: [
            {
              type: "subItems",
              value: "",
              subItems: [
                { id: "s-1", title: "Compress/resize large images and add lazy loading" },
                { id: "s-2", title: "Preload critical fonts and use font-display swap" },
                { id: "s-3", title: "Remove unused scripts and defer non-critical JS" },
              ],
            },
          ],
        },
      ],
    },
  ],
  "template-2": [
    {
      id: "sec-1",
      title: "Research",
      items: [
        {
          id: "k-1",
          title: "Collect seed terms",
          description: "Start with products, problems, and competitor language.",
          contents: [
            {
              type: "subItems",
              value: "",
              subItems: [
                { id: "k-1-1", title: "List core products/services" },
                { id: "k-1-2", title: "List problems your users search for" },
                { id: "k-1-3", title: "Pull top terms from competitor nav + headings" },
              ],
            },
          ],
        },
        {
          id: "k-2",
          title: "Map one primary keyword per page",
          description: "Avoid cannibalization by giving each page a clear job.",
          contents: [
            {
              type: "text",
              value:
                "- Assign a primary keyword per URL.\n- Add a few close variants as secondary.\n- If two pages compete, merge or differentiate.",
            },
          ],
        },
      ],
    },
  ],
  "template-3": [
    {
      id: "sec-1",
      title: "Triage",
      items: [
        {
          id: "c-1",
          title: "Pick candidates",
          description: "Focus on pages with impressions and declining clicks.",
          contents: [
            {
              type: "text",
              value: "Start with pages ranking 4-20 and pages that recently lost traffic.",
            },
          ],
        },
        {
          id: "c-2",
          title: "Improve the outline and headings",
          description: "Make the page easier to scan and more complete than competitors.",
          contents: [
            {
              type: "subItems",
              value: "",
              subItems: [
                { id: "c-2-1", title: "Add missing sections based on top competitors" },
                { id: "c-2-2", title: "Rewrite H1/H2 to match intent and clarity" },
                { id: "c-2-3", title: "Add a short summary near the top" },
              ],
            },
          ],
        },
      ],
    },
  ],
  "template-4": [
    {
      id: "sec-1",
      title: "Before Publish",
      items: [
        {
          id: "p-1",
          title: "Title + meta description reviewed",
          description: "Ensure title and description match intent and include primary term.",
        },
        {
          id: "p-2",
          title: "Internal links added",
          description: "Link from at least 2 relevant pages to the updated URL.",
        },
        {
          id: "p-3",
          title: "Tracking updated",
          description: "Add the keyword to your tracking list and note the publish date.",
        },
      ],
    },
  ],
  "template-5": [
    {
      id: "sec-1",
      title: "Profile Setup",
      items: [
        {
          id: "l-1",
          title: "Categories and services",
          description: "Choose a specific primary category and fill supporting services.",
          contents: [
            {
              type: "text",
              value:
                "- Primary category should match your core offer.\n- Add secondary categories sparingly.\n- Fill services with natural phrasing.",
            },
          ],
        },
        {
          id: "l-2",
          title: "Photos and posts",
          description: "Add real photos and publish weekly updates.",
          contents: [
            {
              type: "subItems",
              value: "",
              subItems: [
                { id: "l-2-1", title: "Add exterior/interior photos" },
                { id: "l-2-2", title: "Add team/product photos" },
                { id: "l-2-3", title: "Publish 1 post per week (offer, update, event)" },
              ],
            },
          ],
        },
      ],
    },
  ],
};

export async function seedLocalTestData(db: LocalDb): Promise<void> {
  await cleanupLocalTestData(db);

  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  const nowMs = now.getTime();
  const at = (offset: number) => sqliteTime(new Date(nowMs + offset));

  await db.insert(users).values([
    {
      id: "user-1",
      email: "admin@test.com",
      password_hash: DEV_PASSWORD_HASH,
      name: "Admin (Pro)",
      username: "admin",
      displayUsername: "admin",
      avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=admin",
      email_verified: true,
      auth_created_at: now,
      auth_updated_at: now,
      created_at: at(0),
    },
    {
      id: "user-2",
      email: "john@test.com",
      password_hash: DEV_PASSWORD_HASH,
      name: "John (Free)",
      username: "john",
      displayUsername: "john",
      avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=john",
      email_verified: true,
      auth_created_at: now,
      auth_updated_at: now,
      created_at: at(0),
    },
    {
      id: "user-3",
      email: "jane@test.com",
      password_hash: DEV_PASSWORD_HASH,
      name: "Jane (Pro)",
      username: "jane",
      displayUsername: "jane",
      avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=jane",
      email_verified: true,
      auth_created_at: now,
      auth_updated_at: now,
      created_at: at(0),
    },
    {
      id: "user-4",
      email: "bob@test.com",
      password_hash: DEV_PASSWORD_HASH,
      name: "Bob (Free)",
      username: "bob",
      displayUsername: "bob",
      avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=bob",
      email_verified: true,
      auth_created_at: now,
      auth_updated_at: now,
      created_at: at(0),
    },
  ]);

  await db.insert(account).values(
    TEST_USER_IDS.map((userId, index) => ({
      id: (index + 1).toString(16).padStart(32, "0"),
      accountId: userId,
      providerId: "credential",
      userId,
      password: DEV_PASSWORD_HASH,
      createdAt: now,
      updatedAt: now,
    })),
  );

  await db.insert(entitlement_overrides).values([
    {
      user_id: "user-1",
      plan: "pro",
      note: "Seeded dev persona: Admin (Pro)",
      created_at: at(0),
      updated_at: at(0),
    },
    {
      user_id: "user-3",
      plan: "pro",
      note: "Seeded dev persona: Jane (Pro)",
      created_at: at(0),
      updated_at: at(0),
    },
  ]);

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

  await db.insert(team_members).values([
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

  await db.insert(team_invites).values({
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

  await db.insert(team_entitlement_overrides).values({
    team_id: "team-seed-growth",
    plan: "team",
    note: "Seeded premium team workspace for local verification",
    created_at: at(0),
    updated_at: at(0),
  });

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
      slug: "technical-seo-audit-checklist",
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
      slug: "keyword-research-mapping-checklist",
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
      slug: "content-refresh-checklist",
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
      slug: "local-seo-gbp-checklist",
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

  const checklistRunRows: (typeof checklist_runs.$inferInsert)[] = [
    {
      id: "run-1",
      user_id: "user-1",
      template_id: "template-1",
      title: "Technical SEO Audit - Sprint",
      items: json([
        {
          id: "sec-1",
          title: "Crawl and Indexation",
          items: [
            { id: "t-1", title: "Check robots.txt and meta robots", isCompleted: true },
            { id: "t-2", title: "Validate XML sitemap(s)", isCompleted: false },
          ],
        },
        {
          id: "sec-2",
          title: "Performance and Core Web Vitals",
          items: [
            { id: "t-3", title: "Run a quick PageSpeed test", isCompleted: false },
            {
              id: "t-4",
              title: "Fix obvious render-blocking issues",
              isCompleted: false,
              contents: [
                {
                  type: "subItems",
                  value: "",
                  subItems: [
                    {
                      id: "s-1",
                      title: "Compress/resize large images and add lazy loading",
                      isCompleted: true,
                    },
                    {
                      id: "s-2",
                      title: "Preload critical fonts and use font-display swap",
                      isCompleted: false,
                    },
                    {
                      id: "s-3",
                      title: "Remove unused scripts and defer non-critical JS",
                      isCompleted: false,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ]),
      status: "in_progress",
      started_at: at(-2 * DAY),
      created_at: at(-2 * DAY),
      progress: 20,
    },
    {
      id: "run-2",
      user_id: "user-2",
      template_id: "template-2",
      title: "Keyword Mapping - Week 1",
      items: json([
        {
          id: "sec-1",
          title: "Research",
          items: [
            { id: "k-1", title: "Collect seed terms", isCompleted: true },
            { id: "k-2", title: "Map one primary keyword per page", isCompleted: true },
          ],
        },
      ]),
      status: "completed",
      started_at: at(-DAY),
      created_at: at(-DAY),
      progress: 100,
    },
    {
      id: "run-3",
      user_id: "user-3",
      template_id: "template-3",
      title: "Refresh - Top Page",
      items: json([
        {
          id: "sec-1",
          title: "Triage",
          items: [
            { id: "c-1", title: "Pick candidates", isCompleted: true },
            {
              id: "c-2",
              title: "Improve the outline and headings",
              isCompleted: false,
              contents: [
                {
                  type: "subItems",
                  value: "",
                  subItems: [
                    {
                      id: "c-2-1",
                      title: "Add missing sections based on top competitors",
                      isCompleted: true,
                    },
                    {
                      id: "c-2-2",
                      title: "Rewrite H1/H2 to match intent and clarity",
                      isCompleted: false,
                    },
                    {
                      id: "c-2-3",
                      title: "Add a short summary near the top",
                      isCompleted: false,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ]),
      status: "in_progress",
      started_at: at(-3 * HOUR),
      created_at: at(-3 * HOUR),
      progress: 50,
    },
    {
      id: "team-run-growth-launch",
      user_id: "user-1",
      team_id: "team-seed-growth",
      template_id: "team-template-growth-launch",
      title: "Growth Launch - Shared Run",
      items: json([
        {
          id: "team-sec-1",
          title: "Launch Prep",
          items: [
            { id: "team-l-1", title: "Confirm owners and due date", isCompleted: true },
            { id: "team-l-2", title: "Review SEO requirements", isCompleted: false },
            { id: "team-l-3", title: "Create launch run", isCompleted: false },
          ],
        },
      ]),
      status: "in_progress",
      started_at: at(-DAY),
      created_by_user_id: "user-1",
      assigned_to_user_id: "user-4",
      started_by_user_id: "user-2",
      created_at: at(-DAY),
      updated_at: at(-6 * HOUR),
      progress: 33,
    },
    {
      id: "team-run-client-reporting",
      user_id: "user-3",
      team_id: "team-seed-client",
      template_id: "team-template-client-reporting",
      title: "Client Reporting QA - July",
      items: json([
        {
          id: "client-sec-1",
          title: "Report QA",
          items: [
            { id: "client-r-1", title: "Confirm ranking screenshots", isCompleted: true },
            { id: "client-r-2", title: "Check action item owners", isCompleted: true },
            {
              id: "client-r-3",
              title: "Verify client-ready summary",
              isCompleted: false,
            },
          ],
        },
      ]),
      status: "in_progress",
      started_at: at(-10 * HOUR),
      created_by_user_id: "user-3",
      assigned_to_user_id: "user-4",
      started_by_user_id: "user-3",
      created_at: at(-10 * HOUR),
      updated_at: at(-3 * HOUR),
      progress: 67,
    },
  ];
  for (const checklistRun of checklistRunRows) {
    await db.insert(checklist_runs).values(checklistRun);
  }

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
        inviteUrlPath: "/team-invites/dev-client-john-invite",
      }),
      user_agent: "seed",
      created_at: at(-12 * HOUR),
    },
  ]);
}

export async function seedOfficialLocalLogin(db: LocalDb): Promise<void> {
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  const timestamp = sqliteTime(now);

  await db
    .delete(account)
    .where(and(eq(account.userId, "serp-user"), eq(account.providerId, "credential")));
  await db.insert(account).values({
    id: "account-serp-user-credential",
    accountId: "serp-user",
    providerId: "credential",
    userId: "serp-user",
    password: DEV_PASSWORD_HASH,
    createdAt: now,
    updatedAt: now,
  });
  await db
    .update(users)
    .set({
      password_hash: DEV_PASSWORD_HASH,
      email_verified: true,
      auth_updated_at: now,
      updated_at: timestamp,
    })
    .where(eq(users.id, "serp-user"));
  await db
    .insert(entitlement_overrides)
    .values({
      user_id: "serp-user",
      plan: "pro",
      note: "Local official publisher persona: SERP (Pro)",
      created_at: timestamp,
      updated_at: timestamp,
    })
    .onConflictDoUpdate({
      target: entitlement_overrides.user_id,
      set: {
        plan: "pro",
        expires_at: null,
        note: "Local official publisher persona: SERP (Pro)",
        updated_at: timestamp,
      },
    });
}
