import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

import { z } from "zod";
import { normalizeMigrationRange } from "./migration-range-lib.mjs";

const SHA256 = /^[0-9a-f]{64}$/;
const GIT_SHA = /^[0-9a-f]{40}$/;
const D1_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const UUID_LIKE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const REQUIRED_SHAPES = [
  "legacy-flat-items", "missing-section-id", "missing-item-id",
  "missing-direct-subitem-id", "missing-content-subitem-id", "completed-item-with-notes",
];
const EVOLUTION = "0024_safe_template_evolution.sql";
const PRE_EVOLUTION = "0023_add_sitemap_revision_state.sql";

export function resolveSanitizerProfile({ repoRoot, migrationRange, sourceSchema }) {
  const range = normalizeMigrationRange(migrationRange);
  const files = readdirSync(path.join(repoRoot, "db/migrations")).filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
  const expectedSource = range.from === null ? files.at(-1) : files[files.indexOf(range.from) - 1];
  if (!expectedSource || sourceSchema !== expectedSource || (range.to !== null && !files.includes(range.to))) throw new Error("Sanitizer source schema does not match the reviewed migration range.");
  const profile = range.from === EVOLUTION && range.to === EVOLUTION && sourceSchema === PRE_EVOLUTION ? "legacy-template-evolution-v1" : range.from === null && sourceSchema === EVOLUTION ? "current-template-run-v1" : null;
  if (!profile) throw new Error("Sanitizer has no reviewed profile for this range/source schema.");
  return { profile, migrationRange: range, sourceSchema };
}
const SAFE_JSON_KEYS = new Set([
  "id", "title", "description", "notes", "items", "subItems", "contents", "isCompleted",
  "completed", "type", "url", "label", "value", "required", "order", "version", "rules",
]);
const SEMANTIC_NUMERIC_KEYS = new Set(["order", "version", "progress", "position", "sortOrder", "duration", "quantity"]);
const SOURCE_TABLES = new Set([
  "account", "audit_events", "checklist_runs", "d1_migrations", "entitlement_overrides",
  "session", "sitemap_category_revisions", "sitemap_owner_revisions", "sitemap_profile_revisions",
  "sitemap_revisions", "sitemap_shard_revisions", "sqlite_sequence", "stripe_customers",
  "stripe_subscriptions", "stripe_webhook_events", "team_entitlement_overrides", "team_invites",
  "team_members", "teams", "template_likes", "template_versions", "templates", "usage_analytics",
  "users", "verification",
]);

const manifestSchema = z.object({
  schemaVersion: z.literal(3),
  artifactType: z.literal("sanitized-production-shaped"),
  sanitizerVersion: z.string().min(1),
  sourceProfile: z.object({ profile: z.enum(["legacy-template-evolution-v1", "current-template-run-v1"]), migrationRange: z.object({ from: z.string().nullable(), to: z.string().nullable() }).strict(), sourceSchema: z.string() }).strict(),
  provenance: z.object({
    generator: z.string().min(1), gitCommit: z.string().regex(GIT_SHA),
    sourceKind: z.literal("protected-d1-data-only-export"), sourceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    sourceExportSha256: z.string().regex(SHA256), sourceDatabaseIdSha256: z.string().regex(SHA256),
    generatedAt: z.string().datetime(), issueNumber: z.number().int().positive(),
  }).strict(),
  handling: z.object({
    accessOwner: z.string().min(1), purpose: z.literal("staging-rehearsal-only"), retentionDeadline: z.string().datetime(),
    rawSourceCleanup: z.literal("delete-after-sanitizer-exit"),
    artifactTeardown: z.literal("delete-rehearsal-databases-and-expire-artifact"),
  }).strict(),
  selection: z.object({
    sourceCounts: z.object({ users: z.number().int().nonnegative(), templates: z.number().int().nonnegative(), checklistRuns: z.number().int().nonnegative() }).strict(),
    selectedCounts: z.object({ users: z.number().int().positive(), templates: z.number().int().positive(), checklistRuns: z.number().int().positive() }).strict(),
    requiredShapes: z.array(z.string()), coveredShapes: z.array(z.string()), observedSourceShapes: z.array(z.string()), absentSourceShapes: z.array(z.string()), syntheticEdgeCaseRequirements: z.array(z.string()), sourceShapeDigest: z.string().regex(SHA256),
  }).strict(),
  artifact: z.object({ sha256: z.string().regex(SHA256), byteLength: z.number().int().positive() }).strict(),
  privacy: z.object({
    profile: z.literal("source-derived-structure-content-free"), directIdentifiers: z.literal("removed"),
    customerContent: z.literal("removed"), credentialsAndSessions: z.literal("excluded"), passwordMaterial: z.literal("excluded"),
  }).strict(),
  manifestIntegritySha256: z.string().regex(SHA256),
}).strict();

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function integrityDigestFor(manifest) {
  const { manifestIntegritySha256: _ignored, ...unsigned } = manifest;
  return sha256(JSON.stringify(unsigned));
}

export function loadSanitizerPolicy({ repoRoot }) {
  return { ...JSON.parse(readFileSync(path.join(repoRoot, "scripts/data/sanitizer-policy.json"), "utf8")), __repoRoot: repoRoot };
}

function assertRawDataOnlyExport(rawExport) {
  if (/\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX|TRIGGER|VIEW)\b/i.test(rawExport)) throw new Error("Sanitizer source must be a Wrangler data-only export created with --no-schema.");
  if (!/\bINSERT\s+INTO\b/i.test(rawExport)) throw new Error("Sanitizer source did not contain data-export INSERT statements.");
  const tables = [...rawExport.matchAll(/\bINSERT\s+INTO\s+["'`]?([a-z0-9_]+)/gi)].map((match) => match[1].toLowerCase());
  const unexpected = tables.find((table) => !SOURCE_TABLES.has(table));
  if (unexpected) throw new Error(`Rehearsal data-only export contains an unexpected table: ${unexpected}.`);
}

function assertSourceColumns(sql, sourceProfile) {
  if (sourceProfile.profile !== "current-template-run-v1") return;
  for (const match of sql.matchAll(/\bINSERT\s+INTO\s+["'`]?([a-z_]+)["'`]?\s*\(([^)]+)\)\s*VALUES/gi)) {
    const required = { templates: ["content_version"], checklist_runs: ["template_version", "revision", "retired_items"] }[match[1].toLowerCase()];
    const columns = match[2].split(",").map((column) => column.trim().replaceAll(/["'`]/g, "").toLowerCase());
    if (required?.some((column) => !columns.includes(column))) throw new Error("Production-shaped current source omits evolution columns; defaults cannot substitute for source values.");
  }
}

function replaySchema(repoRoot, through) {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys=OFF; CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);");
  const directory = path.join(repoRoot, "db/migrations");
  for (const file of readdirSync(directory).filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort()) {
    database.exec(readFileSync(path.join(directory, file), "utf8"));
    if (file === through) break;
  }
  return database;
}

function emptyData(database) {
  database.exec("PRAGMA foreign_keys=OFF;");
  for (const { name } of database.prepare("SELECT name FROM sqlite_schema WHERE type='trigger'").all()) database.exec(`DROP TRIGGER "${String(name).replaceAll('"', '""')}";`);
  for (const { name } of database.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) database.exec(`DELETE FROM "${String(name).replaceAll('"', '""')}";`);
}

function parseJson(value) { if (typeof value !== "string") return null; try { return JSON.parse(value); } catch { return null; } }
function collectShapes(itemsValue) {
  const items = parseJson(itemsValue);
  const shapes = new Set();
  if (!Array.isArray(items) || items.length === 0) return shapes;
  if (!items.some((entry) => entry && typeof entry === "object" && Array.isArray(entry.items))) shapes.add("legacy-flat-items");
  const sections = items.filter((entry) => entry && typeof entry === "object");
  if (sections.some((section) => !String(section.id ?? ""))) shapes.add("missing-section-id");
  const children = sections.flatMap((section) => Array.isArray(section.items) ? section.items : []);
  if (children.some((item) => item && typeof item === "object" && !String(item.id ?? ""))) shapes.add("missing-item-id");
  if (children.some((item) => Array.isArray(item?.subItems) && item.subItems.some((sub) => sub && typeof sub === "object" && !String(sub.id ?? "")))) shapes.add("missing-direct-subitem-id");
  if (children.some((item) => Array.isArray(item?.contents) && item.contents.some((content) => Array.isArray(content?.subItems) && content.subItems.some((sub) => sub && typeof sub === "object" && !String(sub.id ?? ""))))) shapes.add("missing-content-subitem-id");
  if (children.some((item) => item?.isCompleted === true && typeof item?.notes === "string" && item.notes.length > 0)) shapes.add("completed-item-with-notes");
  return shapes;
}
function stableOrder(row) { return sha256(String(row.id ?? "")); }
function selectRepresentativeRows(rows, signaturesFor, limit) {
  const selected = []; const seen = new Set();
  const sorted = [...rows].sort((a, b) => stableOrder(a).localeCompare(stableOrder(b)));
  for (const row of sorted) {
    const signatures = [...signaturesFor(row)].sort();
    if (signatures.some((signature) => !seen.has(signature))) { selected.push(row); signatures.forEach((signature) => seen.add(signature)); }
  }
  for (const row of sorted) { if (selected.length >= limit) break; if (!selected.includes(row)) selected.push(row); }
  return selected.slice(0, limit);
}

function sanitizeJson(value, pathParts = []) {
  if (Array.isArray(value)) return value.map((entry, index) => sanitizeJson(entry, [...pathParts, index]));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry], index) => {
    const safeKey = SAFE_JSON_KEYS.has(key) ? key : `field_${index + 1}`;
    if (safeKey === "id" && typeof entry === "string") return [safeKey, entry === "" ? "" : `shape-id-${pathParts.join("-") || "root"}`];
    return [safeKey, sanitizeJson(entry, [...pathParts, safeKey])];
  }));
  if (typeof value === "string") return value === "" ? "" : `sanitized-${pathParts.at(-1) ?? "value"}`;
  if (typeof value === "number") {
    const key = pathParts.at(-1);
    if (SEMANTIC_NUMERIC_KEYS.has(key)) return Math.max(-1000000, Math.min(value, 1000000));
    return Number.parseInt(sha256(pathParts.join("/")).slice(0, 8), 16) % 1000000 + 1;
  }
  return value;
}
function sanitizedJsonText(value, fallback) { const parsed = parseJson(value); return JSON.stringify(parsed === null ? fallback : sanitizeJson(parsed)); }
function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "bigint") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}
function insertStatement(table, row, columns) { return `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map((column) => sqlLiteral(row[column])).join(", ")});`; }
function fixedTimestamp(value, index) { return value == null ? null : `2020-01-${String((index % 28) + 1).padStart(2, "0")} 00:00:00`; }

function buildSanitizedSql(database, sourceProfile, preserveSample = false) {
  const users = database.prepare("SELECT * FROM users").all();
  const templates = database.prepare("SELECT * FROM templates").all();
  const runs = database.prepare("SELECT * FROM checklist_runs").all();
  if (!users.length || !templates.length || !runs.length) throw new Error("Production-shaped source must contain users, templates, and checklist runs.");
  for (const row of [...templates, ...runs]) if (!Array.isArray(parseJson(row.items))) throw new Error("Production-shaped source has invalid item JSON; a replacement shape is prohibited.");
  if (sourceProfile.profile === "current-template-run-v1") for (const row of runs) if (!Array.isArray(parseJson(row.retired_items))) throw new Error("Production-shaped current source has invalid retired-item JSON; a replacement shape is prohibited.");
  const bySampleId = (a, b) => Number(a.id.split("-").at(-1)) - Number(b.id.split("-").at(-1));
  const selectedTemplates = preserveSample ? templates.sort(bySampleId) : selectRepresentativeRows(templates, (row) => collectShapes(row.items), 16);
  let selectedRuns = preserveSample ? runs.sort(bySampleId) : selectRepresentativeRows(runs, (row) => new Set([...collectShapes(row.items), `status:${row.status ?? "null"}`, row.deleted_at ? "deleted-run" : "active-run"]), 24);
  const templatesById = new Map(templates.map((row) => [row.id, row]));
  for (const run of selectedRuns) { const template = templatesById.get(run.template_id); if (template && !selectedTemplates.includes(template) && selectedTemplates.length < 24) selectedTemplates.push(template); }
  const selectedTemplateIds = new Set(selectedTemplates.map((row) => row.id));
  selectedRuns = selectedRuns.filter((row) => row.template_id == null || selectedTemplateIds.has(row.template_id));
  if (!selectedRuns.length) throw new Error("Production-shaped source did not yield a relationally valid checklist-run sample.");

  const userIds = new Set();
  for (const row of [...selectedTemplates, ...selectedRuns]) for (const field of ["user_id", "created_by_user_id", "updated_by_user_id", "assigned_to_user_id", "started_by_user_id", "completed_by_user_id"]) if (row[field] != null) userIds.add(row[field]);
  const usersById = new Map(users.map((row) => [row.id, row]));
  const selectedUsers = [...userIds].map((id) => usersById.get(id)).filter(Boolean);
  if (!selectedUsers.length) throw new Error("Production-shaped source rows do not resolve to an owning user.");
  const userMap = new Map(selectedUsers.map((row, index) => [row.id, `rehearsal-owner-${index + 1}`]));
  const templateMap = new Map(selectedTemplates.map((row, index) => [row.id, `rehearsal-template-${index + 1}`]));
  const runMap = new Map(selectedRuns.map((row, index) => [row.id, `rehearsal-run-${index + 1}`]));
  const mapUser = (value) => value == null ? null : (userMap.get(value) ?? null);
  const userColumns = ["id", "email", "password_hash", "name", "avatar_url", "username", "display_username", "email_verified", "auth_created_at", "auth_updated_at", "affiliate_code", "referral_count", "total_earnings", "created_at", "updated_at"];
  const templateColumns = ["id", "user_id", "title", "description", "items", "is_public", "category", "tags", "created_at", "updated_at", "slug", "version", "type", "seo_title", "seo_description", "rules", "owner_type", "team_id", "created_by_user_id", "updated_by_user_id", "deleted_at"];
  const runColumns = ["id", "user_id", "template_id", "title", "items", "status", "started_at", "completed_at", "created_at", "updated_at", "progress", "is_public", "share_token", "share_expires_at", "share_used_at", "team_id", "created_by_user_id", "assigned_to_user_id", "started_by_user_id", "completed_by_user_id", "deleted_at"];
  const current = sourceProfile.profile === "current-template-run-v1";
  if (current) { templateColumns.push("content_version"); runColumns.push("template_version", "revision", "retired_items"); }
  const statements = ["-- Source-derived, content-free production-shaped rehearsal artifact.", "PRAGMA foreign_keys=ON;"];
  selectedUsers.forEach((row, index) => statements.push(insertStatement("users", {
    id: userMap.get(row.id), email: `sanitized-owner-${index + 1}`, password_hash: null, name: null, avatar_url: null,
    username: `sanitized-owner-${index + 1}`, display_username: null, email_verified: row.email_verified ? 1 : 0,
    auth_created_at: 1577836800000 + index, auth_updated_at: 1577836800000 + index, affiliate_code: null,
    referral_count: Math.max(0, Math.min(Number(row.referral_count ?? 0), 3)), total_earnings: 0,
    created_at: fixedTimestamp(row.created_at, index), updated_at: fixedTimestamp(row.updated_at, index),
  }, userColumns)));
  selectedTemplates.forEach((row, index) => statements.push(insertStatement("templates", {
    id: templateMap.get(row.id), user_id: mapUser(row.user_id), title: `Sanitized Template ${index + 1}`,
    description: row.description == null ? null : `Sanitized description ${index + 1}`, items: sanitizedJsonText(row.items, []),
    is_public: row.is_public ? 1 : 0, category: sanitizedJsonText(row.category, []), tags: sanitizedJsonText(row.tags, []),
    created_at: fixedTimestamp(row.created_at, index), updated_at: fixedTimestamp(row.updated_at, index),
    slug: `sanitized-template-${index + 1}`, version: Math.max(1, Number(row.version ?? 1)),
    content_version: row.content_version,
    type: row.type === "workflow" ? "workflow" : "checklist", seo_title: null, seo_description: null,
    rules: sanitizedJsonText(row.rules, []), owner_type: "user", team_id: null,
    created_by_user_id: mapUser(row.created_by_user_id) ?? mapUser(row.user_id), updated_by_user_id: mapUser(row.updated_by_user_id),
    deleted_at: fixedTimestamp(row.deleted_at, index),
  }, templateColumns)));
  selectedRuns.forEach((row, index) => statements.push(insertStatement("checklist_runs", {
    id: runMap.get(row.id), user_id: mapUser(row.user_id), template_id: row.template_id == null ? null : templateMap.get(row.template_id),
    title: `Sanitized Run ${index + 1}`, items: sanitizedJsonText(row.items, []),
    template_version: row.template_version, revision: row.revision, retired_items: current ? sanitizedJsonText(row.retired_items, []) : undefined,
    status: ["not_started", "in_progress", "completed"].includes(row.status) ? row.status : "not_started",
    started_at: fixedTimestamp(row.started_at, index), completed_at: fixedTimestamp(row.completed_at, index),
    created_at: fixedTimestamp(row.created_at, index), updated_at: fixedTimestamp(row.updated_at, index),
    progress: Math.max(0, Math.min(Number(row.progress ?? 0), 100)), is_public: row.is_public ? 1 : 0,
    share_token: null, share_expires_at: null, share_used_at: null, team_id: null,
    created_by_user_id: mapUser(row.created_by_user_id) ?? mapUser(row.user_id), assigned_to_user_id: mapUser(row.assigned_to_user_id),
    started_by_user_id: mapUser(row.started_by_user_id), completed_by_user_id: mapUser(row.completed_by_user_id), deleted_at: fixedTimestamp(row.deleted_at, index),
  }, runColumns)));
  const coveredShapes = [...new Set([...selectedTemplates, ...selectedRuns].flatMap((row) => [...collectShapes(sanitizedJsonText(row.items, []))]))].sort();
  const observedSourceShapes = [...new Set([...templates, ...runs].flatMap((row) => [...collectShapes(row.items)]))].sort();
  if (current && observedSourceShapes.some((shape) => REQUIRED_SHAPES.slice(0, 5).includes(shape))) throw new Error("Production-shaped current source contains untransformed legacy shapes.");
  if (observedSourceShapes.some((shape) => !coveredShapes.includes(shape))) throw new Error("Production-shaped sample lost an observed source shape.");
  const sql = `${statements.join("\n")}\n`;
  assertPrivacySafeSql(sql);
  return { sql, sourceCounts: { users: users.length, templates: templates.length, checklistRuns: runs.length }, selectedCounts: { users: selectedUsers.length, templates: selectedTemplates.length, checklistRuns: selectedRuns.length }, coveredShapes, observedSourceShapes };
}

function assertPrivacySafeSql(sql) {
  for (const line of sql.split("\n")) {
    if (/\bINSERT\s+INTO\s+(?:account|session|verification|stripe_)/i.test(line)) throw new Error("Sanitized artifact contains authentication or billing rows.");
    if (/\b(?:password_hash|share_token)\b/i.test(line) && !/VALUES .*NULL/i.test(line)) throw new Error("Sanitized artifact contains password or token material.");
  }
  if (EMAIL.test(sql)) throw new Error("Sanitized artifact contains an email direct identifier.");
  if (UUID_LIKE.test(sql)) throw new Error("Sanitized artifact contains a UUID-like direct identifier.");
}

function assertSanitizedJson(value) {
  const parsed = parseJson(value);
  if (parsed === null) throw new Error("Sanitized artifact contains invalid JSON.");
  const visit = (entry) => {
    if (typeof entry === "string" && entry !== "" && !/^(?:sanitized-|shape-id-)/.test(entry)) throw new Error("Sanitized artifact contains an unapproved customer-content value.");
    if (Array.isArray(entry)) entry.forEach(visit);
    else if (entry && typeof entry === "object") Object.values(entry).forEach(visit);
  };
  visit(parsed);
}

function assertSanitizedArtifactRows({ repoRoot, sql, sourceProfile }) {
  assertSourceColumns(sql, sourceProfile);
  const database = replaySchema(repoRoot, sourceProfile.sourceSchema);
  try {
    emptyData(database);
    database.exec(sql);
    if (database.prepare("SELECT COUNT(*) total FROM users WHERE password_hash IS NOT NULL OR name IS NOT NULL OR avatar_url IS NOT NULL OR email LIKE '%@%' OR id NOT LIKE 'rehearsal-owner-%' OR email NOT LIKE 'sanitized-owner-%'").get().total) throw new Error("Sanitized artifact contains direct identifiers or password material.");
    if (database.prepare("SELECT COUNT(*) total FROM templates WHERE id NOT LIKE 'rehearsal-template-%' OR title NOT LIKE 'Sanitized Template %' OR slug NOT LIKE 'sanitized-template-%' OR seo_title IS NOT NULL OR seo_description IS NOT NULL OR team_id IS NOT NULL").get().total) throw new Error("Sanitized artifact contains unapproved template identifiers or customer content.");
    if (database.prepare("SELECT COUNT(*) total FROM checklist_runs WHERE id NOT LIKE 'rehearsal-run-%' OR title NOT LIKE 'Sanitized Run %' OR share_token IS NOT NULL OR share_expires_at IS NOT NULL OR share_used_at IS NOT NULL OR team_id IS NOT NULL").get().total) throw new Error("Sanitized artifact contains unapproved run identifiers, content, or credentials.");
    for (const row of database.prepare("SELECT items, category, tags, rules FROM templates").all()) for (const value of Object.values(row)) assertSanitizedJson(value);
    for (const row of database.prepare("SELECT items FROM checklist_runs").all()) assertSanitizedJson(row.items);
    if (sourceProfile.profile === "current-template-run-v1") for (const row of database.prepare("SELECT retired_items FROM checklist_runs").all()) assertSanitizedJson(row.retired_items);
    for (const table of ["account", "session", "verification", "stripe_customers", "stripe_subscriptions", "stripe_webhook_events"]) if (database.prepare(`SELECT COUNT(*) total FROM ${table}`).get().total) throw new Error("Sanitized artifact contains authentication, session, or billing rows.");
    const normalized = buildSanitizedSql(database, sourceProfile, true);
    // The generator's canonical form closes privacy gaps in less-visible columns,
    // JSON keys and numeric values, even if an attacker recomputes public hashes.
    if (normalized.sql !== sql) throw new Error("Sanitized artifact is not canonical content-free source data.");
    return normalized;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Sanitized artifact")) throw error;
    throw new Error("Sanitized artifact could not be verified against the repository schema.");
  } finally { database.close(); }
}

export function normalizeRehearsalDataExport({ repoRoot, rawExport, migrationRange, sourceSchema }) {
  const sourceProfile = resolveSanitizerProfile({ repoRoot, migrationRange, sourceSchema });
  assertRawDataOnlyExport(rawExport);
  assertSourceColumns(rawExport, sourceProfile);
  const database = replaySchema(repoRoot, sourceSchema);
  try {
    emptyData(database);
    const importSql = rawExport.split("\n").filter((line) => !/\b(?:DELETE\s+FROM|INSERT\s+INTO)\s+["'`]?sqlite_sequence\b/i.test(line)).join("\n");
    database.exec(importSql);
    const sourceLedger = database.prepare("SELECT name FROM d1_migrations ORDER BY id").all().map((row) => row.name);
    if (sourceLedger.length) {
      const files = readdirSync(path.join(repoRoot, "db/migrations")).filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
      if (JSON.stringify(sourceLedger) !== JSON.stringify(files.slice(0, files.indexOf(sourceSchema) + 1))) throw new Error("Production-shaped source ledger disagrees with the reviewed source schema.");
    }
    const result = buildSanitizedSql(database, sourceProfile);
    return { ...result, sourceProfile, sourceSha256: sha256(rawExport), artifactSha256: sha256(result.sql) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("Production-shaped")) throw error;
    throw new Error("Sanitizer could not import the protected data-only export into the repository schema; source content was not retained.");
  } finally { database.close(); }
}

export function generateSanitizedRehearsalArtifact({ repoRoot, rawExport, sourceDatabaseId, sourceDate, gitCommit, issueNumber, requestedApproverIdentity, generatedAt, retentionDeadline, migrationRange, sourceSchema }) {
  const policy = loadSanitizerPolicy({ repoRoot });
  if (!policy.allowedAccessOwners.includes(requestedApproverIdentity)) throw new Error(`Sanitization requires an allowlisted access owner; received ${requestedApproverIdentity}.`);
  if (!D1_UUID.test(sourceDatabaseId)) throw new Error("Sanitizer provenance requires an exact source D1 database UUID.");
  const productionDatabaseId = JSON.parse(readFileSync(path.join(repoRoot, "scripts/data/environment-inventory.json"), "utf8")).environments.production.databaseId;
  if (sourceDatabaseId !== productionDatabaseId) throw new Error("Production-shaped sanitizer source must match the checked-in production database ID.");
  const normalized = normalizeRehearsalDataExport({ repoRoot, rawExport, migrationRange, sourceSchema });
  const manifest = {
    schemaVersion: 3, artifactType: "sanitized-production-shaped", sanitizerVersion: policy.sanitizerVersion, sourceProfile: normalized.sourceProfile,
    provenance: { generator: policy.generator, gitCommit, sourceKind: policy.sourceKind, sourceDate, sourceExportSha256: normalized.sourceSha256, sourceDatabaseIdSha256: sha256(sourceDatabaseId), generatedAt: generatedAt.toISOString(), issueNumber },
    handling: { accessOwner: requestedApproverIdentity, purpose: "staging-rehearsal-only", retentionDeadline, rawSourceCleanup: "delete-after-sanitizer-exit", artifactTeardown: "delete-rehearsal-databases-and-expire-artifact" },
    selection: { sourceCounts: normalized.sourceCounts, selectedCounts: normalized.selectedCounts, requiredShapes: normalized.observedSourceShapes, coveredShapes: normalized.coveredShapes, observedSourceShapes: normalized.observedSourceShapes, absentSourceShapes: REQUIRED_SHAPES.filter((shape) => !normalized.observedSourceShapes.includes(shape)), syntheticEdgeCaseRequirements: normalized.sourceProfile.profile === "legacy-template-evolution-v1" ? REQUIRED_SHAPES : [], sourceShapeDigest: sha256(JSON.stringify({ counts: normalized.sourceCounts, shapes: normalized.observedSourceShapes })) },
    artifact: { sha256: normalized.artifactSha256, byteLength: Buffer.byteLength(normalized.sql) },
    privacy: { profile: "source-derived-structure-content-free", directIdentifiers: "removed", customerContent: "removed", credentialsAndSessions: "excluded", passwordMaterial: "excluded" },
    manifestIntegritySha256: "",
  };
  manifest.manifestIntegritySha256 = integrityDigestFor(manifest);
  validateSanitizedRehearsalArtifact({ sql: normalized.sql, manifest, policy, now: generatedAt, migrationRange, sourceSchema });
  return { sql: normalized.sql, manifest };
}

export function validateSanitizedRehearsalArtifact({ sql, manifest, policy, now, migrationRange, sourceSchema }) {
  const parsed = manifestSchema.safeParse(manifest);
  if (!parsed.success) throw new Error(`Strict sanitizer manifest rejected unrecognized or invalid fields: ${parsed.error.message}`);
  const value = parsed.data;
  const expected = resolveSanitizerProfile({ repoRoot: policy.__repoRoot, migrationRange, sourceSchema });
  if (JSON.stringify(value.sourceProfile) !== JSON.stringify(expected)) throw new Error("Sanitizer profile/range/source schema mismatch.");
  if (value.sanitizerVersion !== policy.sanitizerVersion) throw new Error(`Sanitizer version is not allowlisted: ${value.sanitizerVersion}.`);
  if (value.provenance.generator !== policy.generator || value.provenance.sourceKind !== policy.sourceKind) throw new Error("Sanitizer provenance does not match the repository generator policy.");
  if (!policy.allowedAccessOwners.includes(value.handling.accessOwner)) throw new Error(`Manifest does not name an allowlisted access owner: ${value.handling.accessOwner}.`);
  const productionDatabaseId = JSON.parse(readFileSync(path.join(policy.__repoRoot, "scripts/data/environment-inventory.json"), "utf8")).environments.production.databaseId;
  if (value.provenance.sourceDatabaseIdSha256 !== sha256(productionDatabaseId)) throw new Error("Manifest source identity does not match the checked-in production database.");
  const generatedAt = new Date(value.provenance.generatedAt); const deadline = new Date(value.handling.retentionDeadline);
  const maximum = new Date(generatedAt.getTime() + policy.maximumRetentionHours * 60 * 60 * 1000);
  if (generatedAt > now || deadline <= now || deadline > maximum) throw new Error(`Sanitized rehearsal retention must end within ${policy.maximumRetentionHours} hours of generation.`);
  if (value.selection.requiredShapes.some((shape) => !value.selection.coveredShapes.includes(shape))) throw new Error("Sanitized artifact does not preserve every required observed source shape.");
  assertPrivacySafeSql(sql);
  const observed = assertSanitizedArtifactRows({ repoRoot: policy.__repoRoot, sql, sourceProfile: expected });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (!same(value.selection.coveredShapes, observed.coveredShapes) || !same(value.selection.requiredShapes, value.selection.observedSourceShapes) || !same(value.selection.observedSourceShapes, observed.coveredShapes) || !same(value.selection.selectedCounts, observed.selectedCounts) || !same(value.selection.absentSourceShapes, REQUIRED_SHAPES.filter((shape) => !observed.coveredShapes.includes(shape))) || !same(value.selection.syntheticEdgeCaseRequirements, expected.profile === "legacy-template-evolution-v1" ? REQUIRED_SHAPES : []) || value.selection.sourceShapeDigest !== sha256(JSON.stringify({ counts: value.selection.sourceCounts, shapes: value.selection.observedSourceShapes }))) throw new Error("Sanitizer observed coverage metadata does not match the artifact.");
  for (const key of Object.keys(value.selection.sourceCounts)) if (value.selection.sourceCounts[key] < value.selection.selectedCounts[key]) throw new Error("Sanitizer source counts are smaller than the sample.");
  if (value.artifact.sha256 !== sha256(sql) || value.artifact.byteLength !== Buffer.byteLength(sql)) throw new Error("Sanitized artifact bytes do not match the strict manifest integrity fields.");
  if (value.manifestIntegritySha256 !== integrityDigestFor(value)) throw new Error("Sanitizer manifest integrity digest is invalid.");
  return value;
}
