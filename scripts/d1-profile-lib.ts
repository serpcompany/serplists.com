import { createHash } from "node:crypto";
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

export type Actor = "anon" | "admin" | "john";

export type Scenario = {
  name: string;
  actor: Actor;
  method?: string;
  path: string;
  body?: unknown;
  expectedStatus: number;
};

export const personalTemplate = "synthetic-template-50";
export const organizationTemplate = "synthetic-template-40";
export const publicTemplateSlug = "synthetic-template-5";
export const publicTemplateOwner = "synth_6";
export const adminRun = "synthetic-run-40";
export const shareToken = "synthetic-share-50";

export const UPDATE_TEMPLATE = "UPDATE_TEMPLATE";
export const UPDATE_RUN = "UPDATE_RUN";

const get = (name: string, actor: Actor, path: string): Scenario => ({ name, actor, path, expectedStatus: 200 });

export function scenarios(): Scenario[] {
  return [
    get("public catalog (GET /api/templates)", "anon", "/api/templates"),
    get("public catalog (repeat)", "anon", "/api/templates"),
    get("public template by slug", "anon", `/api/templates/slug/${publicTemplateSlug}`),
    get("public template page", "anon", `/profile/${publicTemplateOwner}/${publicTemplateSlug}/`),
    get("public template page (repeat)", "anon", `/profile/${publicTemplateOwner}/${publicTemplateSlug}/`),
    get("public profile page", "anon", "/profile/synth_2/"),
    get("public profile page (repeat)", "anon", "/profile/synth_2/"),
    get("category page", "anon", "/categories/business/"),
    get("shared run page", "anon", `/share/${shareToken}/`),
    get("public profile templates", "anon", "/api/templates/public?userId=synthetic-user-2"),
    get("public profile by username", "anon", "/api/profiles/by-username?username=synth_2"),
    get("shared run", "anon", `/api/checklists/shared/${shareToken}`),
    get("sitemap index", "anon", "/sitemap.xml"),
    get("sitemap pages shard", "anon", "/sitemaps/pages/1.xml"),
    get("sitemap templates shard", "anon", "/sitemaps/templates/1.xml"),
    get("sitemap profiles shard", "anon", "/sitemaps/profiles/1.xml"),
    get("sitemap categories shard", "anon", "/sitemaps/categories/1.xml"),
    get("sitemap index (repeat)", "anon", "/sitemap.xml"),
    get("sitemap templates shard (repeat)", "anon", "/sitemaps/templates/1.xml"),
    { name: "sitemap templates shard (unpublished page)", actor: "anon", path: "/sitemaps/templates/999.xml", expectedStatus: 404 },
    { name: "sitemap categories shard (unpublished page)", actor: "anon", path: "/sitemaps/categories/999.xml", expectedStatus: 404 },
    get("session lookup", "admin", "/api/auth/get-session"),
    get("billing status", "admin", "/api/billing/status"),
    get("my Organizations", "admin", "/api/teams"),
    get("Personal templates (scope=personal)", "admin", "/api/templates?scope=personal"),
    get("signed-in catalog (scope=public, cached)", "admin", "/api/templates?scope=public"),
    get("legacy templates list (public OR mine)", "admin", "/api/templates"),
    get("dashboard templates (Organization)", "admin", "/api/templates?teamId=team-seed-growth"),
    get("archived templates", "admin", "/api/templates/archived"),
    get("template export (owned only; public ones come from the cached catalog)", "admin", "/api/templates/backup?includePublic=1"),
    get("dashboard runs (Personal)", "admin", "/api/checklists"),
    get("dashboard runs (Organization)", "admin", "/api/checklists?teamId=team-seed-growth"),
    get("archived runs", "admin", "/api/checklists/archived"),
    get("template detail", "admin", `/api/templates/${personalTemplate}`),
    get("template history", "admin", `/api/templates/${personalTemplate}/history`),
    get("run detail", "admin", `/api/checklists/${adminRun}`),
    get("run history (run page preview)", "admin", `/api/checklists/${adminRun}/history?limit=8`),
    get("Organization detail", "admin", "/api/teams/team-seed-growth"),
    get("Organization members", "admin", "/api/teams/team-seed-growth/members"),
    get("Organization activity", "admin", "/api/teams/team-seed-growth/activity?limit=10"),
    get("incoming Organization invites", "john", "/api/teams/invites/pending"),
    {
      name: "create template (public)", actor: "admin", method: "POST", path: "/api/templates", expectedStatus: 200,
      body: { title: "Profiled template", is_public: true, categories: ["SEO"], sections: [{ id: "s1", title: "Section", items: [{ id: "i1", title: "Task" }] }] },
    },
    {
      name: "start run", actor: "admin", method: "POST", path: "/api/checklists", expectedStatus: 200,
      body: { template_id: personalTemplate, title: "Profiled run", sections: [{ id: "s1", title: "Section", items: [{ id: "i1", title: "Task one" }, { id: "i2", title: "Task two" }] }] },
    },
    { name: "update template (reconciles runs)", actor: "admin", method: "PUT", path: `/api/templates/${personalTemplate}`, body: UPDATE_TEMPLATE, expectedStatus: 200 },
    { name: "update Organization template (reconciles runs)", actor: "admin", method: "PUT", path: `/api/templates/${organizationTemplate}`, body: UPDATE_TEMPLATE, expectedStatus: 200 },
    { name: "update run progress", actor: "admin", method: "PUT", path: `/api/checklists/${adminRun}`, body: UPDATE_RUN, expectedStatus: 200 },
    { name: "share run", actor: "admin", method: "POST", path: `/api/checklists/run/${adminRun}/share`, body: {}, expectedStatus: 200 },
    get("member Personal templates", "john", "/api/templates?scope=personal"),
    get("member Organization templates", "john", "/api/templates?teamId=team-seed-growth"),
    get("member dashboard runs", "john", "/api/checklists"),
    {
      name: "start run (Free plan, counts active runs)", actor: "john", method: "POST", path: "/api/checklists", expectedStatus: 200,
      body: { template_id: publicTemplateSlug, title: "Profiled Free run", sections: [{ id: "s1", title: "Section", items: [{ id: "i1", title: "Task one" }] }] },
    },
  ];
}

export const currentResourceSchema = z.object({
  sections: z.array(z.unknown()).optional(),
  version: z.number().optional(),
  revision: z.number().optional(),
});
export type CurrentResource = z.infer<typeof currentResourceSchema>;

const d1QueryLineSchema = z
  .object({
    message: z.literal("d1_query"),
    sql: z.string(),
    rowsRead: z.number(),
    rowsWritten: z.number(),
    rowsReturned: z.number(),
    durationMs: z.number(),
  })
  .passthrough();
export type QueryRecord = z.infer<typeof d1QueryLineSchema>;

export function d1QueryRecordIn(serverOutputLine: string): QueryRecord | null {
  const start = serverOutputLine.indexOf("{\"level\"");
  if (start < 0) return null;
  try {
    const parsed = d1QueryLineSchema.safeParse(JSON.parse(serverOutputLine.slice(start)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const PROFILED_SECTION_PREFIX = "s-profiled";
const sectionIdSchema = z.object({ id: z.string() });

const isProfiledSection = (section: unknown) => {
  const parsed = sectionIdSchema.safeParse(section);
  return parsed.success && parsed.data.id.startsWith(PROFILED_SECTION_PREFIX);
};

export function buildUpdateTemplateBody(current: CurrentResource, nonce: string) {
  const kept = (current.sections ?? []).filter((section) => !isProfiledSection(section));
  return {
    sections: [
      ...kept,
      { id: `${PROFILED_SECTION_PREFIX}-${nonce}`, title: "Added", items: [{ id: `i-profiled-${nonce}`, title: "New task" }] },
    ],
    expected_version: current.version,
  };
}

export function buildUpdateRunBody(current: CurrentResource) {
  return { progress: 75, expected_revision: current.revision };
}

export type ScenarioOutcome = { scenario: Pick<Scenario, "name" | "expectedStatus">; status: number; responseBody?: string };
export type StatusFailure = { name: string; expected: number; actual: number; responseBody: string };

export function formatStatus({ scenario, status }: ScenarioOutcome): string {
  return status === scenario.expectedStatus ? String(status) : `INVALID (expected ${scenario.expectedStatus}, got ${status})`;
}

export function evaluateScenarioResults(results: ScenarioOutcome[]): { failures: StatusFailure[]; exitCode: 0 | 1 } {
  const failures = results
    .filter(({ scenario, status }) => status !== scenario.expectedStatus)
    .map(({ scenario, status, responseBody }) => ({
      name: scenario.name,
      expected: scenario.expectedStatus,
      actual: status,
      responseBody: (responseBody ?? "").slice(0, 500),
    }));
  return { failures, exitCode: failures.length > 0 ? 1 : 0 };
}

export const snapshotMetaSchema = z.object({ scale: z.number(), datasetKey: z.string() });
export type SnapshotMeta = z.infer<typeof snapshotMetaSchema>;

export function computeDatasetKey(parts: string[]): string {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part).update("\0");
  return hash.digest("hex");
}

export function readSnapshotMeta(snapshotPath: string): SnapshotMeta | null {
  const metaPath = path.join(snapshotPath, "meta.json");
  if (!existsSync(metaPath) || !existsSync(path.join(snapshotPath, "state"))) return null;
  try {
    const parsed = snapshotMetaSchema.safeParse(JSON.parse(readFileSync(metaPath, "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveSnapshot({ statePath, snapshotPath, meta }: { statePath: string; snapshotPath: string; meta: SnapshotMeta }) {
  rmSync(snapshotPath, { recursive: true, force: true });
  cpSync(statePath, path.join(snapshotPath, "state"), { recursive: true });
  writeFileSync(path.join(snapshotPath, "meta.json"), `${JSON.stringify(meta)}\n`);
}

export function restoreSnapshot({ snapshotPath, statePath }: { snapshotPath: string; statePath: string }) {
  try {
    rmSync(statePath, { recursive: true, force: true });
  } catch (error) {
    throw new Error(`Could not reset ${statePath}; stop any d1:profile or wrangler process using it and retry. ${String(error)}`);
  }
  cpSync(path.join(snapshotPath, "state"), statePath, { recursive: true });
}

export type DatasetPlan = { action: "rebuild" | "restore"; reason: string };

export function resolveDatasetPlan({ reuse, snapshot, scale, datasetKey }: {
  reuse: boolean;
  snapshot: SnapshotMeta | null;
  scale: number;
  datasetKey: string;
}): DatasetPlan {
  if (!reuse) return { action: "rebuild", reason: `building the synthetic dataset at scale ${scale}` };
  if (!snapshot) return { action: "rebuild", reason: "no pristine snapshot to reuse, so rebuilding" };
  if (snapshot.scale !== scale) {
    return { action: "rebuild", reason: `the snapshot is scale ${snapshot.scale}, not ${scale}, so rebuilding` };
  }
  if (snapshot.datasetKey !== datasetKey) {
    return { action: "rebuild", reason: "migrations, the seed or the synthetic data changed since the snapshot, so rebuilding" };
  }
  return { action: "restore", reason: `restoring the pristine scale ${scale} snapshot` };
}
