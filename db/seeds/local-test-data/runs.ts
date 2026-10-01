import { checklist_runs } from "../../schema/index";
import type { LocalDb } from "../../../scripts/data/local-d1";
import { DAY, HOUR, json, type SeedClock } from "./values";

export async function seedTestRuns(db: LocalDb, { at }: SeedClock): Promise<void> {
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
}
