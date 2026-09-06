import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

import { z } from "zod";
import { normalizeMigrationRange } from "./migration-range-lib.mjs";
import { DuplicateJsonKeyError, parseStrictJson } from "./strict-json-lib.mjs";
import { assertPre0024Compatibility } from "./pre0024-compatibility-lib.mjs";

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
  "uploadType", "fileName", "fileSize",
  "kind", "section", "item", "subItem", "sectionId", "itemId", "sectionTitle", "itemTitle",
]);
const SEMANTIC_ENUMS = { type: new Set(["text", "image", "video", "file", "embed", "subItems"]), uploadType: new Set(["url", "upload"]), kind: new Set(["section", "item", "subItem"]) };
const TEMPLATE_TYPES = new Set(['checklist', 'recipe', 'workflow']);
const RUN_STATUSES = new Set(['not_started', 'in_progress', 'completed']);
const TEAM_ROLES = new Set(['owner', 'admin', 'editor', 'runner', 'viewer']);
// Small enough for exhaustive authenticated pairwise isolation checks. Overflow
// is an explicit unsupported cohort, never silent truncation of its relations.
const COHORT_LIMITS = { users: 128, templates: 24, checklistRuns: 24, teams: 16, teamMembers: 96 };
const PROFILE_EXCLUSIONS = ['billing-and-entitlements', 'invites', 'audit-and-version-history', 'source-authentication-and-sessions', 'share-tokens', 'user-profile-and-referrals'];
const countSchema = z.object({ users: z.number().int().nonnegative(), templates: z.number().int().nonnegative(), checklistRuns: z.number().int().nonnegative(), teams: z.number().int().nonnegative(), teamMembers: z.number().int().nonnegative() }).strict();
function sanitizeScalarEnum(value, allowed) {
  return typeof value === 'string' && value.trim() !== '' && !allowed.has(value) ? 'sanitized-enum' : value;
}
const IDENTITY_KEYS = new Set(["id", "sectionId", "itemId"]);
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
  schemaVersion: z.literal(4),
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
    sourceCounts: countSchema,
    selectedCounts: countSchema,
    cohortLimits: countSchema,
    profileExclusions: z.array(z.string()),
    ownershipCoverage: z.object({ source: z.array(z.string()), selected: z.array(z.string()) }).strict(),
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

function invalidSourceSql(message = "Sanitizer source is not a supported Wrangler data-only SQL export.") { throw new Error(message); }

// Parse only the data-export envelope needed here while retaining the original
// SQL bytes. Quoted values and comments are opaque, so SQL-looking customer
// content cannot become statement metadata or a statement delimiter.
function parseDataExportStatements(sql) {
  const statements = [];
  let segmentStart = 0, statementStart = null, tokens = [], i = 0;
  const add = (value, kind, start) => {
    if (statementStart === null) statementStart = start;
    tokens.push({ value, kind });
  };
  const finish = (end) => {
    if (!tokens.length || statementStart === null) invalidSourceSql();
    statements.push({ prefix: sql.slice(segmentStart, statementStart), sql: sql.slice(statementStart, end), tokens });
    segmentStart = end; statementStart = null; tokens = [];
  };
  while (i < sql.length) {
    const start = i, char = sql[i];
    if (/\s/.test(char)) { i++; continue; }
    if (sql.startsWith("--", i)) {
      const end = sql.indexOf("\n", i + 2);
      i = end < 0 ? sql.length : end + 1;
      continue;
    }
    if (sql.startsWith("/*", i)) {
      const end = sql.indexOf("*/", i + 2);
      if (end < 0) invalidSourceSql("Sanitizer source contains an unterminated SQL comment.");
      i = end + 2;
      continue;
    }
    if ("'\"`[".includes(char)) {
      const close = char === "[" ? "]" : char;
      i++;
      let closed = false;
      while (i < sql.length) {
        if (sql[i++] !== close) continue;
        if (char !== "[" && sql[i] === close) { i++; continue; }
        closed = true;
        break;
      }
      if (!closed) invalidSourceSql("Sanitizer source contains an unterminated SQL quote.");
      add(sql.slice(start, i), char === "'" ? "string" : "identifier", start);
      continue;
    }
    const word = /^[A-Za-z_][A-Za-z_0-9$]*/.exec(sql.slice(i));
    if (word) { add(word[0].toUpperCase(), "word", start); i += word[0].length; continue; }
    const number = /^(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(sql.slice(i));
    if (number) { add(number[0], "number", start); i += number[0].length; continue; }
    if (char === ";") { finish(++i); continue; }
    if (char === "\0") invalidSourceSql("Sanitizer source contains a NUL byte.");
    add(char, "symbol", start); i++;
  }
  if (tokens.length) finish(sql.length);
  return { statements, tail: sql.slice(segmentStart) };
}

function identifier(token) {
  if (!token || !["word", "identifier", "string"].includes(token.kind)) invalidSourceSql();
  if (token.kind === "word") return token.value.toLowerCase();
  const close = token.value[0] === "[" ? "]" : token.value[0];
  return token.value.slice(1, -1).replaceAll(close + close, close).toLowerCase();
}

function insertMetadata(statement) {
  const tokens = statement.tokens;
  if (tokens[0]?.kind !== "word" || tokens[0].value !== "INSERT") return null;
  let index = 1;
  if (tokens[index]?.value === "OR") {
    if (!["ROLLBACK", "ABORT", "REPLACE", "FAIL", "IGNORE"].includes(tokens[index + 1]?.value)) invalidSourceSql();
    index += 2;
  }
  if (tokens[index]?.value !== "INTO") invalidSourceSql();
  const table = identifier(tokens[++index]);
  index++;
  const columns = [];
  if (tokens[index]?.value === "(") {
    index++;
    while (tokens[index]?.value !== ")") {
      columns.push(identifier(tokens[index++]));
      if (tokens[index]?.value === ",") index++;
      else if (tokens[index]?.value !== ")") invalidSourceSql();
    }
    index++;
  }
  if (tokens[index]?.value !== "VALUES") invalidSourceSql("Sanitizer source INSERT is not a literal Wrangler VALUES statement.");
  return { table, columns };
}

function isSqliteSequenceStatement(statement) {
  const insert = insertMetadata(statement);
  if (insert) return insert.table === "sqlite_sequence";
  const tokens = statement.tokens;
  return tokens.length === 3 && tokens[0]?.value === "DELETE" && tokens[1]?.value === "FROM" && identifier(tokens[2]) === "sqlite_sequence";
}

function assertRawDataOnlyExport(parsed) {
  const inserts = [];
  for (const statement of parsed.statements) {
    const insert = insertMetadata(statement);
    if (insert) { inserts.push(insert); continue; }
    const first = statement.tokens[0]?.value;
    if (isSqliteSequenceStatement(statement) || ["PRAGMA", "BEGIN", "COMMIT", "END"].includes(first)) continue;
    if (["CREATE", "ALTER", "DROP"].includes(first)) throw new Error("Sanitizer source must be a Wrangler data-only export created with --no-schema.");
    invalidSourceSql();
  }
  if (!inserts.length) throw new Error("Sanitizer source did not contain data-export INSERT statements.");
  const unexpected = inserts.find(({ table }) => !SOURCE_TABLES.has(table));
  if (unexpected) throw new Error("Sanitizer source structure rejected: unsupported table (SOURCE_TABLE).");
  return inserts;
}

function assertSourceColumns(inserts, sourceProfile) {
  const current = sourceProfile.profile === "current-template-run-v1";
  for (const { table, columns } of inserts) {
    const required = {
      templates: ["version", "is_public", "type", ...(current ? ["content_version"] : [])],
      checklist_runs: ["progress", "is_public", "status", ...(current ? ["template_version", "revision", "retired_items"] : [])],
    }[table];
    // A positional VALUES insert must supply every writable table column;
    // SQLite enforces that arity during import. Explicit column lists can omit
    // defaulted lifecycle fields, so those lists need this additional check.
    if (columns.length && required?.some((column) => !columns.includes(column))) throw new Error("Production-shaped source omits required lifecycle columns; defaults cannot substitute for source values.");
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
  for (const { name } of database.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*'").all()) database.exec(`DELETE FROM "${String(name).replaceAll('"', '""')}";`);
}

function parseJson(value) {
  if (typeof value !== "string") return null;
  try { return parseStrictJson(value); }
  catch (error) {
    if (error instanceof DuplicateJsonKeyError) throw error;
    return null;
  }
}
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
  // Reserve at most two personal principals per family before shape coverage
  // and general fill. Owner cardinality must never make the sample unbounded.
  const firstPersonal = sorted.find(row => row.team_id == null && row.user_id != null);
  const secondPersonal = firstPersonal && sorted.find(row => row.team_id == null && row.user_id != null && row.user_id !== firstPersonal.user_id);
  if (secondPersonal) {
    selected.push(firstPersonal, secondPersonal);
    for (const row of selected) for (const signature of signaturesFor(row)) seen.add(signature);
  }
  for (const row of sorted) {
    const signatures = [...signaturesFor(row)].sort();
    if (signatures.some((signature) => !seen.has(signature))) { selected.push(row); signatures.forEach((signature) => seen.add(signature)); }
  }
  if (selected.length > limit) throw new Error('Production-shaped sample cannot fit personal-owner representatives and observed shapes within its bounds.');
  for (const row of sorted) { if (selected.length >= limit) break; if (!selected.includes(row)) selected.push(row); }
  return selected;
}

function sanitizeJson(value, pathParts = [], identities = new Map()) {
  if (Array.isArray(value)) return value.map((entry, index) => sanitizeJson(entry, [...pathParts, index], identities));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry], index) => {
    const safeKey = SAFE_JSON_KEYS.has(key) ? key : `field_${index + 1}`;
    if (IDENTITY_KEYS.has(safeKey) && (typeof entry === "string" || typeof entry === "number")) {
      if (typeof entry === "string" && entry.trim() === "") return [safeKey, entry];
      // A single typed identity map spans the selected templates, runs and
      // retired items. Encounter-order aliases reveal no source identifier and
      // canonical re-normalization assigns the same aliases again.
      if (!identities.has(entry)) identities.set(entry, typeof entry === "number" ? -(identities.size + 1) : `shape-id-${identities.size + 1}`);
      return [safeKey, identities.get(entry)];
    }
    return [safeKey, sanitizeJson(entry, [...pathParts, safeKey], identities)];
  }));
  if (typeof value === "string") return value === "" || SEMANTIC_ENUMS[pathParts.at(-1)]?.has(value) ? value : `sanitized-${pathParts.at(-1) ?? "value"}`;
  if (typeof value === "number") {
    const key = pathParts.at(-1);
    // Preserve asset validation thresholds, including negative invalid sizes.
    if (key === "fileSize") return value;
    if (SEMANTIC_NUMERIC_KEYS.has(key)) return value;
    return Number.parseInt(sha256(pathParts.join("/")).slice(0, 8), 16) % 1000000 + 1;
  }
  return value;
}
function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "bigint") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}
function insertStatement(table, row, columns) { return `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map((column) => sqlLiteral(row[column])).join(", ")});`; }
function fixedTimestamp(value, index) { return value == null ? null : `2020-01-${String((index % 28) + 1).padStart(2, "0")} 00:00:00`; }

function assertLifecycleScalars(templates, runs, current) {
  const fail = () => { throw new Error("Production-shaped source contains an unsupported lifecycle scalar type or representation."); };
  for (const row of templates) for (const key of current ? ["version", "content_version"] : ["version"]) if (!Number.isSafeInteger(row[key])) fail();
  for (const row of runs) {
    if (current) for (const key of ["template_version", "revision"]) if (!Number.isSafeInteger(row[key])) fail();
    if (row.progress !== null && (typeof row.progress !== "number" || !Number.isFinite(row.progress) || (Number.isInteger(row.progress) && !Number.isSafeInteger(row.progress)))) fail();
  }
  for (const row of [...templates, ...runs]) if (![null, 0, 1].includes(row.is_public)) fail();
}

// Compare decimal values, not token spelling or the already-rounded Number.
// Keep the exponent exact without expanding potentially enormous powers of ten.
function decimalValue(token) {
  const [mantissa, exponent = "0"] = token.toLowerCase().split("e");
  const negative = mantissa.startsWith("-");
  const [whole, fraction = ""] = (negative ? mantissa.slice(1) : mantissa).split(".");
  const digits = (whole + fraction).replace(/^0+/, "");
  if (!digits) return "0";
  const coefficient = digits.replace(/0+$/, "");
  const scale = BigInt(exponent) - BigInt(fraction.length) + BigInt(digits.length - coefficient.length);
  return `${negative ? "-" : ""}${coefficient}e${scale}`;
}

function assertSemanticJsonNumbers(value) {
  if (parseJson(value) === null) return;
  JSON.parse(value, (key, entry, context) => {
    if (typeof entry === "number" && SAFE_JSON_KEYS.has(key) && (IDENTITY_KEYS.has(key) || SEMANTIC_NUMERIC_KEYS.has(key) || key === "fileSize")) {
      const underflow = entry === 0 && /[1-9]/.test(context.source.split(/[eE]/)[0]);
      if (!Number.isFinite(entry) || (Number.isInteger(entry) && !Number.isSafeInteger(entry)) || underflow || decimalValue(context.source) !== decimalValue(JSON.stringify(entry))) throw new Error(IDENTITY_KEYS.has(key) ? "Production-shaped source contains an unsupported identity JSON number representation." : "Production-shaped source contains an unsupported semantic JSON number representation.");
    }
    return entry;
  });
}

function buildSanitizedSql(database, sourceProfile, preserveSample = false, repoRoot) {
  const identities = new Map();
  const sanitizedJsonText = (value, fallback) => { const parsed = parseJson(value); return JSON.stringify(parsed === null ? fallback : sanitizeJson(parsed, [], identities)); };
  const users = database.prepare("SELECT * FROM users").all();
  const templates = database.prepare("SELECT * FROM templates").all();
  const runs = database.prepare("SELECT * FROM checklist_runs").all();
  assertLifecycleScalars(templates, runs, sourceProfile.profile === "current-template-run-v1");
  for (const row of templates) for (const key of ["items", "category", "tags", "rules"]) assertSemanticJsonNumbers(row[key]);
  for (const row of runs) for (const key of ["items", "retired_items"]) assertSemanticJsonNumbers(row[key]);
  if (sourceProfile.profile === "legacy-template-evolution-v1") assertPre0024Compatibility({ repoRoot, templates, runs });
  const teams = database.prepare("SELECT * FROM teams").all();
  const members = database.prepare("SELECT * FROM team_members").all();
  const teamsById = new Map(teams.map(row => [row.id, row]));
  const usersById = new Map(users.map(row => [row.id, row]));
  const templatesById = new Map(templates.map(row => [row.id, row]));
  const userFields = ['user_id', 'created_by_user_id', 'updated_by_user_id', 'assigned_to_user_id', 'started_by_user_id', 'completed_by_user_id', 'billing_owner_user_id', 'invited_by_user_id'];
  for (const row of [...templates, ...runs, ...teams, ...members]) {
    for (const field of userFields) if (row[field] != null && !usersById.has(row[field])) throw new Error('Production-shaped source contains an unresolved principal relation.');
    if (row.team_id != null && !teamsById.has(row.team_id)) throw new Error('Production-shaped source contains an orphan team relation.');
  }
  for (const row of templates) if (!['user', 'team'].includes(row.owner_type) || (row.owner_type === 'team') !== (row.team_id != null) || (row.owner_type === 'user' && row.user_id == null)) throw new Error('Production-shaped source contains malformed ownership.');
  for (const row of runs) if ((row.template_id != null && !templatesById.has(row.template_id)) || (row.team_id == null && row.user_id == null)) throw new Error('Production-shaped source contains an orphan template or missing run owner.');
  for (const row of members) if (!TEAM_ROLES.has(row.role) || !['active', 'disabled'].includes(row.status)) throw new Error('Production-shaped source contains an unsupported membership role or status.');
  if (!users.length || !templates.length || !runs.length) throw new Error("Production-shaped source must contain users, templates, and checklist runs.");
  for (const row of [...templates, ...runs]) if (!Array.isArray(parseJson(row.items))) throw new Error("Production-shaped source has invalid item JSON; a replacement shape is prohibited.");
  if (sourceProfile.profile === "current-template-run-v1") for (const row of runs) if (!Array.isArray(parseJson(row.retired_items))) throw new Error("Production-shaped current source has invalid retired-item JSON; a replacement shape is prohibited.");
  const bySampleId = (a, b) => Number(a.id.split("-").at(-1)) - Number(b.id.split("-").at(-1));
  const ownershipShapes = row => {
    if (row.team_id == null) return ['personal-owner'];
    const context = `team-state:${teamsById.get(row.team_id).archived_at == null ? 'active' : 'archived'}`;
    return ['team-owner', context, ...members.filter(member => member.team_id === row.team_id).flatMap(member => [`role:${member.role}:${member.status}`, `${context}:role:${member.role}:${member.status}`])];
  };
  const selectedTemplates = preserveSample ? templates.sort(bySampleId) : selectRepresentativeRows(templates, (row) => new Set([...collectShapes(row.items), ...ownershipShapes(row)]), 16);
  const selectedRuns = preserveSample ? runs.sort(bySampleId) : selectRepresentativeRows(runs, (row) => new Set([...collectShapes(row.items), ...ownershipShapes(row), `status:${row.status ?? "null"}`, row.deleted_at ? "deleted-run" : "active-run"]), 24);
  for (const run of selectedRuns) { const template = templatesById.get(run.template_id); if (template && !selectedTemplates.includes(template)) selectedTemplates.push(template); }
  if (!selectedRuns.length) throw new Error("Production-shaped source did not yield a relationally valid checklist-run sample.");

  const teamIds = new Set([...selectedTemplates, ...selectedRuns].map(row => row.team_id).filter(id => id != null));
  const selectedTeams = teams.filter(row => teamIds.has(row.id)).sort(preserveSample ? bySampleId : (a,b) => stableOrder(a).localeCompare(stableOrder(b)));
  const selectedMembers = members.filter(row => teamIds.has(row.team_id)).sort(preserveSample ? bySampleId : (a,b) => stableOrder(a).localeCompare(stableOrder(b)));
  const userIds = new Set();
  for (const row of [...selectedTemplates, ...selectedRuns, ...selectedTeams, ...selectedMembers]) for (const field of userFields) if (row[field] != null) userIds.add(row[field]);
  const selectedUsers = [...userIds].map(id => usersById.get(id)).sort(preserveSample ? bySampleId : (a,b) => stableOrder(a).localeCompare(stableOrder(b)));
  const selectedCounts = { users: selectedUsers.length, templates: selectedTemplates.length, checklistRuns: selectedRuns.length, teams: selectedTeams.length, teamMembers: selectedMembers.length };
  for (const key of Object.keys(COHORT_LIMITS)) if (selectedCounts[key] > COHORT_LIMITS[key]) throw new Error('Production-shaped relational cohort exceeds its explicit supported bounds.');
  const coveredOwners = new Set([...selectedTemplates, ...selectedRuns].flatMap(ownershipShapes));
  if ([...templates, ...runs].flatMap(ownershipShapes).some(shape => !coveredOwners.has(shape))) throw new Error('Production-shaped sample cannot cover observed ownership or membership dimensions within its bounds.');
  if (!selectedUsers.length) throw new Error("Production-shaped source rows do not resolve to an owning user.");
  const userMap = new Map(selectedUsers.map((row, index) => [row.id, `rehearsal-owner-${index + 1}`]));
  const templateMap = new Map(selectedTemplates.map((row, index) => [row.id, `rehearsal-template-${index + 1}`]));
  const runMap = new Map(selectedRuns.map((row, index) => [row.id, `rehearsal-run-${index + 1}`]));
  const teamMap = new Map(selectedTeams.map((row, index) => [row.id, `rehearsal-team-${index + 1}`]));
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
  selectedTeams.forEach((row, index) => statements.push(insertStatement('teams', {
    id: teamMap.get(row.id), name: `Sanitized Team ${index + 1}`, slug: row.slug == null ? null : `sanitized-team-${index + 1}`,
    billing_owner_user_id: mapUser(row.billing_owner_user_id), created_by_user_id: mapUser(row.created_by_user_id),
    created_at: fixedTimestamp(row.created_at,index), updated_at: fixedTimestamp(row.updated_at,index), archived_at: fixedTimestamp(row.archived_at,index),
  }, ['id','name','slug','billing_owner_user_id','created_by_user_id','created_at','updated_at','archived_at'])));
  selectedMembers.forEach((row,index) => statements.push(insertStatement('team_members', {
    id: `rehearsal-member-${index + 1}`, team_id: teamMap.get(row.team_id), user_id: mapUser(row.user_id), role: row.role, status: row.status,
    invited_by_user_id: mapUser(row.invited_by_user_id), joined_at: fixedTimestamp(row.joined_at,index), created_at: fixedTimestamp(row.created_at,index), updated_at: fixedTimestamp(row.updated_at,index),
  }, ['id','team_id','user_id','role','status','invited_by_user_id','joined_at','created_at','updated_at'])));
  selectedTemplates.forEach((row, index) => statements.push(insertStatement("templates", {
    id: templateMap.get(row.id), user_id: mapUser(row.user_id), title: `Sanitized Template ${index + 1}`,
    description: row.description == null ? null : `Sanitized description ${index + 1}`, items: sanitizedJsonText(row.items, []),
    is_public: row.is_public, category: sanitizedJsonText(row.category, []), tags: sanitizedJsonText(row.tags, []),
    created_at: fixedTimestamp(row.created_at, index), updated_at: fixedTimestamp(row.updated_at, index),
    slug: `sanitized-template-${index + 1}`, version: row.version,
    content_version: row.content_version,
    type: sanitizeScalarEnum(row.type, TEMPLATE_TYPES), seo_title: null, seo_description: null,
    rules: sanitizedJsonText(row.rules, []), owner_type: row.owner_type, team_id: row.team_id == null ? null : teamMap.get(row.team_id),
    created_by_user_id: mapUser(row.created_by_user_id), updated_by_user_id: mapUser(row.updated_by_user_id),
    deleted_at: fixedTimestamp(row.deleted_at, index),
  }, templateColumns)));
  selectedRuns.forEach((row, index) => statements.push(insertStatement("checklist_runs", {
    id: runMap.get(row.id), user_id: mapUser(row.user_id), template_id: row.template_id == null ? null : templateMap.get(row.template_id),
    title: `Sanitized Run ${index + 1}`, items: sanitizedJsonText(row.items, []),
    template_version: row.template_version, revision: row.revision, retired_items: current ? sanitizedJsonText(row.retired_items, []) : undefined,
    status: sanitizeScalarEnum(row.status, RUN_STATUSES),
    started_at: fixedTimestamp(row.started_at, index), completed_at: fixedTimestamp(row.completed_at, index),
    created_at: fixedTimestamp(row.created_at, index), updated_at: fixedTimestamp(row.updated_at, index),
    progress: row.progress, is_public: row.is_public,
    share_token: null, share_expires_at: null, share_used_at: null, team_id: row.team_id == null ? null : teamMap.get(row.team_id),
    created_by_user_id: mapUser(row.created_by_user_id), assigned_to_user_id: mapUser(row.assigned_to_user_id),
    started_by_user_id: mapUser(row.started_by_user_id), completed_by_user_id: mapUser(row.completed_by_user_id), deleted_at: fixedTimestamp(row.deleted_at, index),
  }, runColumns)));
  const coveredShapes = [...new Set([...selectedTemplates, ...selectedRuns].flatMap((row) => [...collectShapes(sanitizedJsonText(row.items, []))]))].sort();
  const observedSourceShapes = [...new Set([...templates, ...runs].flatMap((row) => [...collectShapes(row.items)]))].sort();
  if (current && observedSourceShapes.some((shape) => REQUIRED_SHAPES.slice(0, 5).includes(shape))) throw new Error("Production-shaped current source contains untransformed legacy shapes.");
  if (observedSourceShapes.some((shape) => !coveredShapes.includes(shape))) throw new Error("Production-shaped sample lost an observed source shape.");
  const sql = `${statements.join("\n")}\n`;
  assertPrivacySafeSql(sql);
  return { sql, sourceCounts: { users: users.length, templates: templates.length, checklistRuns: runs.length, teams: teams.length, teamMembers: members.length }, selectedCounts, ownershipCoverage: { source: [...new Set([...templates, ...runs].flatMap(ownershipShapes))].sort(), selected: [...coveredOwners].sort() }, coveredShapes, observedSourceShapes };
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
  const visit = (entry, key) => {
    if (typeof entry === "string" && entry !== "" && !(IDENTITY_KEYS.has(key) && entry.trim() === "") && !SEMANTIC_ENUMS[key]?.has(entry) && !/^(?:sanitized-|shape-id-)/.test(entry)) throw new Error("Sanitized artifact contains an unapproved customer-content value.");
    if (Array.isArray(entry)) entry.forEach(value => visit(value));
    else if (entry && typeof entry === "object") Object.entries(entry).forEach(([key, value]) => visit(value, key));
  };
  visit(parsed);
}

function assertSanitizedArtifactRows({ repoRoot, sql, sourceProfile }) {
  const parsed = parseDataExportStatements(sql);
  assertSourceColumns(assertRawDataOnlyExport(parsed), sourceProfile);
  const database = replaySchema(repoRoot, sourceProfile.sourceSchema);
  try {
    emptyData(database);
    database.exec(sql);
    if (database.prepare("SELECT COUNT(*) total FROM users WHERE password_hash IS NOT NULL OR name IS NOT NULL OR avatar_url IS NOT NULL OR email LIKE '%@%' OR id NOT LIKE 'rehearsal-owner-%' OR email NOT LIKE 'sanitized-owner-%'").get().total) throw new Error("Sanitized artifact contains direct identifiers or password material.");
    if (database.prepare("SELECT COUNT(*) total FROM templates WHERE id NOT LIKE 'rehearsal-template-%' OR title NOT LIKE 'Sanitized Template %' OR slug NOT LIKE 'sanitized-template-%' OR seo_title IS NOT NULL OR seo_description IS NOT NULL").get().total) throw new Error("Sanitized artifact contains unapproved template identifiers or customer content.");
    if (database.prepare("SELECT COUNT(*) total FROM checklist_runs WHERE id NOT LIKE 'rehearsal-run-%' OR title NOT LIKE 'Sanitized Run %' OR share_token IS NOT NULL OR share_expires_at IS NOT NULL OR share_used_at IS NOT NULL").get().total) throw new Error("Sanitized artifact contains unapproved run identifiers, content, or credentials.");
    for (const row of database.prepare("SELECT items, category, tags, rules FROM templates").all()) for (const value of Object.values(row)) assertSanitizedJson(value);
    for (const row of database.prepare("SELECT items FROM checklist_runs").all()) assertSanitizedJson(row.items);
    if (sourceProfile.profile === "current-template-run-v1") for (const row of database.prepare("SELECT retired_items FROM checklist_runs").all()) assertSanitizedJson(row.retired_items);
    for (const table of ["account", "session", "verification", "stripe_customers", "stripe_subscriptions", "stripe_webhook_events"]) if (database.prepare(`SELECT COUNT(*) total FROM ${table}`).get().total) throw new Error("Sanitized artifact contains authentication, session, or billing rows.");
    const normalized = buildSanitizedSql(database, sourceProfile, true, repoRoot);
    // The generator's canonical form closes privacy gaps in less-visible columns,
    // JSON keys and numeric values, even if an attacker recomputes public hashes.
    if (normalized.sql !== sql) throw new Error("Sanitized artifact is not canonical content-free source data.");
    return normalized;
  } catch (error) {
    if (error instanceof DuplicateJsonKeyError) throw new Error("Sanitized artifact contains duplicate JSON object keys.");
    if (error instanceof Error && error.message.startsWith("Sanitized artifact")) throw error;
    throw new Error("Sanitized artifact could not be verified against the repository schema.");
  } finally { database.close(); }
}

function expectedSourceLedger(repoRoot, sourceSchema) {
  const files = readdirSync(path.join(repoRoot, "db/migrations")).filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
  return files.slice(0, files.indexOf(sourceSchema) + 1);
}

function validateSourceLedger({ repoRoot, sourceSchema, embeddedLedger }) {
  const expected = expectedSourceLedger(repoRoot, sourceSchema);
  if (!embeddedLedger.length) throw new Error("Production-shaped source ledger is missing; the protected source export must include its complete migration ledger.");
  if (JSON.stringify(embeddedLedger) !== JSON.stringify(expected)) throw new Error("Production-shaped source ledger disagrees with the complete ordered repository prefix through the reviewed source schema.");
}

export function normalizeRehearsalDataExport({ repoRoot, rawExport, migrationRange, sourceSchema }) {
  const sourceProfile = resolveSanitizerProfile({ repoRoot, migrationRange, sourceSchema });
  const parsed = parseDataExportStatements(rawExport);
  const inserts = assertRawDataOnlyExport(parsed);
  assertSourceColumns(inserts, sourceProfile);
  const database = replaySchema(repoRoot, sourceSchema);
  try {
    emptyData(database);
    const importSql = parsed.statements.map((statement) => statement.prefix + (isSqliteSequenceStatement(statement) ? "" : statement.sql)).join("") + parsed.tail;
    database.exec(importSql);
    const sourceLedger = database.prepare("SELECT name FROM d1_migrations ORDER BY id").all().map((row) => row.name);
    validateSourceLedger({ repoRoot, sourceSchema, embeddedLedger: sourceLedger });
    const result = buildSanitizedSql(database, sourceProfile, false, repoRoot);
    return { ...result, sourceProfile, sourceSha256: sha256(rawExport), artifactSha256: sha256(result.sql) };
  } catch (error) {
    if (error instanceof DuplicateJsonKeyError) throw new Error("Production-shaped source contains duplicate JSON object keys.");
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("Production-shaped")) throw error;
    throw new Error("Sanitizer could not import the protected data-only export into the repository schema; source content was not retained.");
  } finally { database.close(); }
}

export function generateSanitizedRehearsalArtifact({ repoRoot, rawExport, sourceDatabaseId, sourceDate, gitCommit, issueNumber, requestedApproverIdentity, generatedAt, retentionDeadline, migrationRange, sourceSchema }) {
  const policy = loadSanitizerPolicy({ repoRoot });
  if (!policy.allowedAccessOwners.includes(requestedApproverIdentity)) throw new Error("Sanitization requires an allowlisted access owner (SOURCE_OWNER).");
  if (!D1_UUID.test(sourceDatabaseId)) throw new Error("Sanitizer provenance requires an exact source D1 database UUID.");
  const productionDatabaseId = JSON.parse(readFileSync(path.join(repoRoot, "scripts/data/environment-inventory.json"), "utf8")).environments.production.databaseId;
  if (sourceDatabaseId !== productionDatabaseId) throw new Error("Production-shaped sanitizer source must match the checked-in production database ID.");
  const normalized = normalizeRehearsalDataExport({ repoRoot, rawExport, migrationRange, sourceSchema });
  const manifest = {
    schemaVersion: 4, artifactType: "sanitized-production-shaped", sanitizerVersion: policy.sanitizerVersion, sourceProfile: normalized.sourceProfile,
    provenance: { generator: policy.generator, gitCommit, sourceKind: policy.sourceKind, sourceDate, sourceExportSha256: normalized.sourceSha256, sourceDatabaseIdSha256: sha256(sourceDatabaseId), generatedAt: generatedAt.toISOString(), issueNumber },
    handling: { accessOwner: requestedApproverIdentity, purpose: "staging-rehearsal-only", retentionDeadline, rawSourceCleanup: "delete-after-sanitizer-exit", artifactTeardown: "delete-rehearsal-databases-and-expire-artifact" },
    selection: { sourceCounts: normalized.sourceCounts, selectedCounts: normalized.selectedCounts, cohortLimits: COHORT_LIMITS, profileExclusions: PROFILE_EXCLUSIONS, ownershipCoverage: normalized.ownershipCoverage, requiredShapes: normalized.observedSourceShapes, coveredShapes: normalized.coveredShapes, observedSourceShapes: normalized.observedSourceShapes, absentSourceShapes: REQUIRED_SHAPES.filter((shape) => !normalized.observedSourceShapes.includes(shape)), syntheticEdgeCaseRequirements: normalized.sourceProfile.profile === "legacy-template-evolution-v1" ? REQUIRED_SHAPES : [], sourceShapeDigest: sha256(JSON.stringify({ counts: normalized.sourceCounts, shapes: normalized.observedSourceShapes })) },
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
  if (!parsed.success) throw new Error("Strict sanitizer manifest rejected unrecognized or invalid fields (MANIFEST_STRUCTURE).");
  const value = parsed.data;
  const expected = resolveSanitizerProfile({ repoRoot: policy.__repoRoot, migrationRange, sourceSchema });
  if (JSON.stringify(value.sourceProfile) !== JSON.stringify(expected)) throw new Error("Sanitizer profile/range/source schema mismatch.");
  if (value.sanitizerVersion !== policy.sanitizerVersion) throw new Error("Sanitizer version is not allowlisted (MANIFEST_VERSION).");
  if (value.provenance.generator !== policy.generator || value.provenance.sourceKind !== policy.sourceKind) throw new Error("Sanitizer provenance does not match the repository generator policy.");
  if (!policy.allowedAccessOwners.includes(value.handling.accessOwner)) throw new Error("Manifest does not name an allowlisted access owner (MANIFEST_OWNER).");
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
  if (!same(value.selection.cohortLimits, COHORT_LIMITS) || !same(value.selection.profileExclusions, PROFILE_EXCLUSIONS)) throw new Error('Sanitizer cohort bounds or profile exclusions mismatch.');
  if (!same(value.selection.ownershipCoverage, observed.ownershipCoverage)) throw new Error('Sanitizer ownership coverage mismatch.');
  if (value.artifact.sha256 !== sha256(sql) || value.artifact.byteLength !== Buffer.byteLength(sql)) throw new Error("Sanitized artifact bytes do not match the strict manifest integrity fields.");
  if (value.manifestIntegritySha256 !== integrityDigestFor(value)) throw new Error("Sanitizer manifest integrity digest is invalid.");
  return value;
}
