import { drizzle } from "drizzle-orm/d1";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import * as schema from "../../db/schema/index";
import { seedLocalTestData } from "../../db/seeds/local";
import apiWorker from "../../functions/api/[[route]]";
import type { Env } from "../../functions/api/types";
import { withD1Profiling } from "../../functions/api/utils/d1-profiler";
import { loadPublicTemplate } from "../../functions/seo/public-template-lookup";
import { loadSharedRunTitle } from "../../functions/seo/shared-run-lookup";
import { serveSitemapIndex, serveTemplatesSitemap } from "../../functions/sitemap/routes";
import { buildSyntheticSql, datasetCounts } from "../../scripts/d1-profile-dataset";
import {
  adminRun,
  buildUpdateRunBody,
  buildUpdateTemplateBody,
  currentResourceSchema,
  organizationTemplate,
  personalTemplate,
  publicTemplateSlug,
  shareToken,
} from "../../scripts/d1-profile-lib";
import { apiEnv } from "../support/apiEnv";
import { firstOf } from "../support/elements";
import { readJson } from "../support/readJson";
import { startLocalD1, type LocalD1 } from "./local-d1-handler-env";

const ORIGIN = "http://localhost:8788";
const SYNTHETIC_DATASET_SCALE = 0.02;
const SEEDED_PASSWORD = "password123";
const ORGANIZATION = "team-seed-growth";
const MARGIN = { rows: 2, share: 0.1 };
const D1_COST_PLAN = "docs/exec-plans/active/d1-cost.md";

const seededCountsSchema = z.object({
  publicTemplates: z.number(),
  livePublicTemplates: z.number(),
  adminPersonalTemplates: z.number(),
  organizationTemplates: z.number(),
  adminRuns: z.number(),
  organizationRuns: z.number(),
  users: z.number(),
  usersWithUsername: z.number(),
});
type SeededCounts = z.infer<typeof seededCountsSchema>;

const SEEDED_COUNTS_SQL = `SELECT
  (SELECT COUNT(*) FROM templates WHERE is_public = 1) AS publicTemplates,
  (SELECT COUNT(*) FROM templates WHERE is_public = 1 AND deleted_at IS NULL) AS livePublicTemplates,
  (SELECT COUNT(*) FROM templates WHERE owner_type = 'user' AND user_id = 'user-1' AND team_id IS NULL) AS adminPersonalTemplates,
  (SELECT COUNT(*) FROM templates WHERE team_id = '${ORGANIZATION}' AND deleted_at IS NULL) AS organizationTemplates,
  (SELECT COUNT(*) FROM checklist_runs WHERE user_id = 'user-1') AS adminRuns,
  (SELECT COUNT(*) FROM checklist_runs WHERE team_id = '${ORGANIZATION}' AND deleted_at IS NULL) AS organizationRuns,
  (SELECT COUNT(*) FROM users) AS users,
  (SELECT COUNT(*) FROM users WHERE username IS NOT NULL) AS usersWithUsername`;

type Actor = "visitor" | "admin" | "john";
type Send = (env: Env) => Promise<unknown>;
type Budget =
  | { kind: "bounded"; measured: number }
  | { kind: "unbounded"; grows: string; rows: (seeded: SeededCounts) => number; measuredBeyondThat: number };
type Route = { name: string; prepare: () => Promise<Send>; budget: Budget; reason: string };

let d1: LocalD1;
let plainEnv: Env;
let seeded: SeededCounts;
const cookies: Record<Actor, string> = { visitor: "", admin: "", john: "" };
const measurements = new Map<string, { answered: boolean; rowsRead: number }>();

const withMargin = (rows: number) => rows + Math.max(MARGIN.rows, Math.ceil(rows * MARGIN.share));

const bounded = (measured: number): Budget => ({ kind: "bounded", measured });

const unbounded = (grows: string, rows: (seeded: SeededCounts) => number, measuredBeyondThat: number): Budget => ({
  kind: "unbounded",
  grows,
  rows,
  measuredBeyondThat,
});

const limitOf = (budget: Budget) =>
  budget.kind === "bounded" ? withMargin(budget.measured) : budget.rows(seeded) + withMargin(budget.measuredBeyondThat);

function routeRequest(actor: Actor, path: string, method: string, body: unknown): Request {
  const headers = new Headers({ Origin: ORIGIN });
  if (cookies[actor]) headers.set("Cookie", cookies[actor]);
  if (body === undefined) return new Request(`${ORIGIN}/api/${path}`, { method, headers });
  const json = JSON.stringify(body);
  headers.set("Content-Type", "application/json");
  headers.set("Content-Length", String(new TextEncoder().encode(json).byteLength));
  return new Request(`${ORIGIN}/api/${path}`, { method, headers, body: json });
}

const get = (actor: Actor, path: string) => async (): Promise<Send> => (env) =>
  apiWorker.fetch(routeRequest(actor, path, "GET", undefined), env);

const write = (actor: Actor, method: "POST" | "PUT", path: string, body: () => Promise<unknown>) => async (): Promise<Send> => {
  const sent = await body();
  return (env) => apiWorker.fetch(routeRequest(actor, path, method, sent), env);
};

const call = (send: Send) => async () => send;

async function currentStateOf(path: string) {
  return readJson(await apiWorker.fetch(routeRequest("admin", path, "GET", undefined), plainEnv), currentResourceSchema);
}

const sitemapContext = (env: Env, path: string) => ({ request: new Request(`${ORIGIN}${path}`), env, waitUntil: () => undefined });

const oneSectionTemplate = { sections: [{ id: "s1", title: "Section", items: [{ id: "i1", title: "Task one" }] }] };

const EVERY_PUBLIC_TEMPLATE_AND_OWNER = "every public Template and each live one's owner";
const publicTemplatesAndOwners = (n: SeededCounts) => n.publicTemplates + n.livePublicTemplates;

const ROUTES: Route[] = [
  {
    name: "the public catalog on a cache miss",
    prepare: get("visitor", "templates?scope=public"),
    budget: unbounded(EVERY_PUBLIC_TEMPLATE_AND_OWNER, publicTemplatesAndOwners, 1),
    reason: "it lists every public Template through idx_templates_public_created_at; the edge cache serves it for 5 minutes",
  },
  {
    name: "the catalog a signed-in page requests",
    prepare: get("admin", "templates?scope=public"),
    budget: unbounded(EVERY_PUBLIC_TEMPLATE_AND_OWNER, publicTemplatesAndOwners, 3),
    reason: "it is the visitor's catalog plus the session lookup",
  },
  {
    name: "the template list without a scope that old tabs send, for a visitor",
    prepare: get("visitor", "templates"),
    budget: unbounded(EVERY_PUBLIC_TEMPLATE_AND_OWNER, publicTemplatesAndOwners, 1),
    reason: "a visitor's list without a scope is the public catalog, uncached (TD-15)",
  },
  {
    name: "the template list without a scope that old tabs send, signed in",
    prepare: get("admin", "templates"),
    budget: unbounded(
      "every public Template, the user's Personal Templates and each live public one twice",
      (n) => n.publicTemplates + n.adminPersonalTemplates + 2 * n.livePublicTemplates,
      5,
    ),
    reason: "public OR the user's own, through two indexes, unbounded and uncached (TD-15)",
  },
  {
    name: "the Personal template list",
    prepare: get("admin", "templates?scope=personal"),
    budget: unbounded("3 rows per Personal Template of the user", (n) => 3 * n.adminPersonalTemplates, 3),
    reason: "it reads the user's Personal Templates through idx_templates_owner, and their owners",
  },
  {
    name: "the archived template list",
    prepare: get("admin", "templates/archived"),
    budget: unbounded("each Personal Template of the user", (n) => n.adminPersonalTemplates, 4),
    reason: "it reads every Personal Template of the user through idx_templates_owner to find the archived ones",
  },
  {
    name: "the Organization template list",
    prepare: get("admin", `templates?teamId=${ORGANIZATION}`),
    budget: unbounded("3 rows per Organization Template", (n) => 3 * n.organizationTemplates, 4),
    reason: "it reads every Template of the Organization through idx_templates_team_id, and their owners",
  },
  {
    name: "the template export",
    prepare: get("admin", "templates/backup?includePublic=1"),
    budget: unbounded("2 rows per Personal Template of the user", (n) => 2 * n.adminPersonalTemplates, 5),
    reason: "it exports the active context's own Templates; public ones come from the page's cached catalog",
  },
  {
    name: "the Personal run list",
    prepare: get("admin", "checklists"),
    budget: unbounded("each run the user owns", (n) => n.adminRuns, 5),
    reason: "idx_checklist_runs_user_id reads every run of the user, Organization runs included, before the team filter",
  },
  {
    name: "the archived run list",
    prepare: get("admin", "checklists/archived"),
    budget: unbounded("each run the user owns", (n) => n.adminRuns, 4),
    reason: "it reads every run of the user to keep the archived ones",
  },
  {
    name: "the Organization run list",
    prepare: get("admin", `checklists?teamId=${ORGANIZATION}`),
    budget: unbounded("3 rows per Organization run", (n) => 3 * n.organizationRuns, 4),
    reason: "it reads every run of the Organization and a correlated template subquery for each",
  },
  {
    name: "the sitemap index on a cache miss",
    prepare: call((env) => serveSitemapIndex(sitemapContext(env, "/sitemap.xml"))),
    budget: unbounded(
      "every user and username, every public Template twice and each live one three times",
      (n) => n.users + n.usersWithUsername + 2 * n.publicTemplates + 3 * n.livePublicTemplates,
      93,
    ),
    reason: "it builds every entry; it misses only after a deploy or a change to what it lists",
  },
  {
    name: "the templates sitemap shard on a cache miss",
    prepare: call((env) => serveTemplatesSitemap(sitemapContext(env, "/sitemaps/templates/1.xml"), "1")),
    budget: unbounded("every public Template and each live one twice", (n) => n.publicTemplates + 2 * n.livePublicTemplates, 15),
    reason: "it builds every public Template entry; it misses only after a change to what it lists",
  },
  {
    name: "a public Template by slug",
    prepare: get("visitor", `templates/slug/${publicTemplateSlug}`),
    budget: bounded(2),
    reason: "one lookup on the slug index",
  },
  {
    name: "a public profile's Templates",
    prepare: get("visitor", "templates/public?userId=synthetic-user-2"),
    budget: bounded(12),
    reason: "unary + on is_public keeps the planner on idx_templates_owner (7,005 rows before it)",
  },
  {
    name: "a public profile by username",
    prepare: get("visitor", "profiles/by-username?username=synth_2"),
    budget: bounded(1),
    reason: "one lookup on the username index",
  },
  {
    name: "a shared run",
    prepare: get("visitor", `checklists/shared/${shareToken}`),
    budget: bounded(2),
    reason: "one lookup on the share token index",
  },
  {
    name: "a public Template page's metadata",
    prepare: call((env) => loadPublicTemplate(env, ORIGIN, publicTemplateSlug)),
    budget: bounded(2),
    reason: "one row by slug",
  },
  {
    name: "a shared run page's title",
    prepare: call((env) => loadSharedRunTitle(env, shareToken)),
    budget: bounded(1),
    reason: "one indexed read",
  },
  {
    name: "the session",
    prepare: get("admin", "auth/get-session"),
    budget: bounded(2),
    reason: "the session by token and its user by id",
  },
  {
    name: "the billing status",
    prepare: get("admin", "billing/status"),
    budget: bounded(3),
    reason: "the session and one row from each billing table",
  },
  {
    name: "the user's Organizations",
    prepare: get("admin", "teams"),
    budget: bounded(6),
    reason: "the user's memberships through the member index",
  },
  {
    name: "a Template by id",
    prepare: get("admin", `templates/${personalTemplate}`),
    budget: bounded(4),
    reason: "one row by primary key",
  },
  {
    name: "a Template's history",
    prepare: get("admin", `templates/${personalTemplate}/history`),
    budget: bounded(108),
    reason: "the newest 50 versions on the unique (template_id, version) index and the newest events, each with its user",
  },
  {
    name: "a run by id",
    prepare: get("admin", `checklists/${adminRun}`),
    budget: bounded(6),
    reason: "one row by primary key and the membership check",
  },
  {
    name: "a run's history preview",
    prepare: get("admin", `checklists/${adminRun}/history?limit=8`),
    budget: bounded(21),
    reason: "the run page asks for 8 events, read through idx_audit_events_resource",
  },
  {
    name: "an Organization",
    prepare: get("admin", `teams/${ORGANIZATION}`),
    budget: bounded(5),
    reason: "the membership check and one row by id",
  },
  {
    name: "an Organization's members",
    prepare: get("admin", `teams/${ORGANIZATION}/members`),
    budget: bounded(16),
    reason: "one Organization's members and their users",
  },
  {
    name: "an Organization's activity",
    prepare: get("admin", `teams/${ORGANIZATION}/activity?limit=10`),
    budget: bounded(24),
    reason: "10 events and their users",
  },
  {
    name: "incoming Organization invites",
    prepare: get("john", "teams/invites/pending"),
    budget: bounded(8),
    reason: "pending invites through the email index",
  },
];

const reconcilingUpdateOf = (template: string) => async () =>
  buildUpdateTemplateBody(await currentStateOf(`templates/${template}`), "budget");

const progressUpdateOf = (run: string) => async () => buildUpdateRunBody(await currentStateOf(`checklists/${run}`));

const newRunOf = (templateId: string, title: string) => async () => ({ template_id: templateId, title, ...oneSectionTemplate });

const newPublicTemplate = async () => ({ title: "Budgeted template", is_public: true, categories: ["SEO"], ...oneSectionTemplate });

const WRITES: Route[] = [
  {
    name: "creating a public Template",
    prepare: write("admin", "POST", "templates", newPublicTemplate),
    budget: bounded(8),
    reason: "the plan, a slug check on the unique index and the inserts",
  },
  {
    name: "starting a run",
    prepare: write("admin", "POST", "checklists", newRunOf(personalTemplate, "Budgeted run")),
    budget: bounded(4),
    reason: "the Template by id and the plan",
  },
  {
    name: "updating a Template, which reconciles its runs",
    prepare: write("admin", "PUT", `templates/${personalTemplate}`, reconcilingUpdateOf(personalTemplate)),
    budget: bounded(22),
    reason: "idx_checklist_runs_template_owner finds only that Template's runs (26,685 rows before it)",
  },
  {
    name: "updating an Organization Template",
    prepare: write("admin", "PUT", `templates/${organizationTemplate}`, reconcilingUpdateOf(organizationTemplate)),
    budget: bounded(12),
    reason: "the same composite index finds that Template's runs (4,010 rows before it)",
  },
  {
    name: "saving run progress",
    prepare: write("admin", "PUT", `checklists/${adminRun}`, progressUpdateOf(adminRun)),
    budget: bounded(9),
    reason: "the run by id, the membership checks and a guarded update",
  },
  {
    name: "sharing a run",
    prepare: write("admin", "POST", `checklists/run/${adminRun}/share`, async () => ({})),
    budget: bounded(9),
    reason: "the run by id, the membership checks and a guarded update",
  },
  {
    name: "starting a run on the Free plan",
    prepare: write("john", "POST", "checklists", newRunOf(publicTemplateSlug, "Budgeted Free run")),
    budget: bounded(9),
    reason: "the active-run count uses the owner index (26,676 rows before it)",
  },
];

async function signIn(email: string): Promise<string> {
  const signingIn = routeRequest("visitor", "auth/sign-in/email", "POST", { email, password: SEEDED_PASSWORD });
  const response = await apiWorker.fetch(signingIn, plainEnv);
  const session = response.headers
    .getSetCookie()
    .map((cookie) => firstOf(cookie.split(";")))
    .find((cookie) => cookie.startsWith("better-auth.session_token="));
  if (!session) throw new Error(`Signing in ${email} answered ${response.status} with no session cookie`);
  return session;
}

async function measure(route: Route) {
  const send = await route.prepare();
  let rowsRead = 0;
  const profiled = apiEnv({ ...plainEnv, DB: withD1Profiling(d1.env.DB, (record) => (rowsRead += record.rowsRead)) });
  const result = await send(profiled);
  measurements.set(route.name, { answered: result instanceof Response ? result.ok : result !== null, rowsRead });
}

const title = (route: Route) =>
  route.budget.kind === "bounded"
    ? `${route.name} reads at most ${withMargin(route.budget.measured)} rows`
    : `${route.name} reads ${route.budget.grows} plus at most ${withMargin(route.budget.measuredBeyondThat)} rows, ` +
      `since it is unbounded by design until ${D1_COST_PLAN} bounds it`;

describe.sequential("rows read per hot request on local D1, with the synthetic dataset at a small scale", () => {
  beforeAll(async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    d1 = await startLocalD1("rows-read-budgets");
    plainEnv = apiEnv(d1.env);
    await seedLocalTestData(drizzle(d1.env.DB, { schema }));
    const statements = buildSyntheticSql(datasetCounts(SYNTHETIC_DATASET_SCALE)).split(/;\s*\n/).map((sql) => sql.trim()).filter(Boolean);
    await d1.env.DB.batch(statements.map((sql) => d1.env.DB.prepare(sql)));
    seeded = seededCountsSchema.parse(await d1.env.DB.prepare(SEEDED_COUNTS_SQL).first());
    cookies.admin = await signIn("admin@test.com");
    cookies.john = await signIn("john@test.com");
    await Promise.all(ROUTES.map(measure));
    for (const route of WRITES) await measure(route);
  }, 120_000);

  afterAll(async () => {
    await d1?.dispose();
    vi.restoreAllMocks();
  });

  it.each([...ROUTES, ...WRITES].map((route) => ({ ...route, title: title(route) })))("$title", (route) => {
    const measurement = measurements.get(route.name);
    const limit = limitOf(route.budget);

    expect(measurement?.answered, `${route.name} did not succeed, so its rows measure an error path`).toBe(true);
    expect(
      measurement?.rowsRead,
      `${route.name} read ${measurement?.rowsRead} rows, over its budget of ${limit}: ${route.reason}. ` +
        "If it is meant to read more, update its budget in this table (docs/design-docs/d1-cost.md#measuring).",
    ).toBeLessThanOrEqual(limit);
  });
});
