import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

const SHA256 = /^[0-9a-f]{64}$/;
const GIT_SHA = /^[0-9a-f]{40}$/;
const UUID_LIKE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const D1_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.literal("synthetic-production-shaped"),
  sanitizerVersion: z.string().min(1),
  provenance: z.object({
    generator: z.string().min(1),
    gitCommit: z.string().regex(GIT_SHA),
    sourceKind: z.string().min(1),
    sourceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    sourceExportSha256: z.string().regex(SHA256),
    sourceDatabaseIdSha256: z.string().regex(SHA256),
    generatedAt: z.string().datetime(),
    issueNumber: z.number().int().positive(),
    verification: z.literal("unverified-request-metadata"),
  }).strict(),
  requestMetadata: z.object({
    requestedApproverIdentity: z.string().min(1),
    requestedPurpose: z.literal("staging-rehearsal-only"),
    verification: z.literal("unverified-request-metadata"),
  }).strict(),
  retentionDeadline: z.string().datetime(),
  artifact: z.object({
    sha256: z.string().regex(SHA256),
    byteLength: z.number().int().positive(),
    templateSha256: z.string().regex(SHA256),
  }).strict(),
  privacy: z.object({
    profile: z.literal("repo-owned-synthetic-only"),
    directIdentifiers: z.literal("none"),
    privateContent: z.literal("none"),
  }).strict(),
  manifestIntegritySha256: z.string().regex(SHA256),
}).strict();

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function integrityDigestFor(manifest) {
  const { manifestIntegritySha256: _ignored, ...unsigned } = manifest;
  return sha256(JSON.stringify(unsigned));
}

export function loadSanitizerPolicy({ repoRoot }) {
  return {
    ...JSON.parse(
      readFileSync(path.join(repoRoot, "scripts/data/sanitizer-policy.json"), "utf8"),
    ),
    __repoRoot: repoRoot,
  };
}

function loadTemplate({ repoRoot, policy }) {
  return readFileSync(path.join(repoRoot, policy.templatePath), "utf8");
}

function assertRawDataOnlyExport(rawExport) {
  if (/\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX|TRIGGER)\b/i.test(rawExport)) {
    throw new Error("Sanitizer source must be a Wrangler data-only export created with --no-schema.");
  }
  if (!/\bINSERT\s+INTO\b/i.test(rawExport)) {
    throw new Error("Sanitizer source did not contain data-export INSERT statements.");
  }
}

export function normalizeRehearsalDataExport({ repoRoot, rawExport }) {
  assertRawDataOnlyExport(rawExport);
  const policy = loadSanitizerPolicy({ repoRoot });
  const template = loadTemplate({ repoRoot, policy });
  const tableNames = [...rawExport.matchAll(/\bINSERT\s+INTO\s+["'`]?([a-z0-9_]+)/gi)]
    .map((match) => match[1].toLowerCase());
  const allowedTables = new Set([
    "d1_migrations",
    "sqlite_sequence",
    "users",
    "templates",
    "checklist_runs",
    "sitemap_revisions",
    "sitemap_profile_revisions",
    "sitemap_owner_revisions",
    "sitemap_category_revisions",
    "sitemap_shard_revisions",
  ]);
  const unexpectedTable = tableNames.find((tableName) => !allowedTables.has(tableName));
  if (unexpectedTable) {
    throw new Error(`Rehearsal data-only export contains an unexpected table: ${unexpectedTable}.`);
  }
  for (const requiredId of [
    "rehearsal-owner-v1",
    "rehearsal-template-v1",
    "rehearsal-run-v1",
  ]) {
    if (!rawExport.includes(requiredId)) {
      throw new Error(`Rehearsal data-only export is missing repo-owned identity ${requiredId}.`);
    }
  }
  if (EMAIL.test(rawExport) || UUID_LIKE.test(rawExport)) {
    throw new Error("Rehearsal data-only export contains a direct identifier.");
  }
  assertPrivacySafeSql({ sql: template, template });
  return {
    sql: template,
    sourceSha256: sha256(rawExport),
    artifactSha256: sha256(template),
  };
}

function assertPrivacySafeSql({ sql, template }) {
  if (/\b(?:password|password_hash|access_token|refresh_token|id_token|token_hash|session_token)\b/i.test(sql)) {
    throw new Error("Sanitized artifact contains password or token material.");
  }
  if (/\b(?:account|session|verification)\b/i.test(sql)) {
    throw new Error("Sanitized artifact contains authentication material.");
  }
  if (/\b(?:stripe_customers|stripe_subscriptions|stripe_webhook_events)\b/i.test(sql)) {
    throw new Error("Sanitized artifact contains billing material.");
  }
  if (EMAIL.test(sql)) throw new Error("Sanitized artifact contains an email direct identifier.");
  if (UUID_LIKE.test(sql)) throw new Error("Sanitized artifact contains a UUID-like direct identifier.");
  if (sql !== template) {
    throw new Error(
      "Sanitized artifact does not match the repo-owned synthetic profile; arbitrary names or private content are forbidden.",
    );
  }
}

export function generateSanitizedRehearsalArtifact({
  repoRoot,
  rawExport,
  sourceDatabaseId,
  sourceDate,
  gitCommit,
  issueNumber,
  requestedApproverIdentity,
  generatedAt,
  retentionDeadline,
}) {
  const policy = loadSanitizerPolicy({ repoRoot });
  if (!policy.allowedRequestedApproverIdentities.includes(requestedApproverIdentity)) {
    throw new Error(
      `Sanitization requires an allowlisted requested approver identity; received ${requestedApproverIdentity}.`,
    );
  }
  if (!D1_UUID.test(sourceDatabaseId)) {
    throw new Error("Sanitizer provenance requires an exact source D1 database UUID.");
  }
  const productionDatabaseId = JSON.parse(
    readFileSync(path.join(repoRoot, "scripts/data/environment-inventory.json"), "utf8"),
  ).environments.production.databaseId;
  if (sourceDatabaseId !== productionDatabaseId) {
    throw new Error("Production-shaped sanitizer source must match the checked-in production database ID.");
  }
  assertRawDataOnlyExport(rawExport);
  const sql = loadTemplate({ repoRoot, policy });
  assertPrivacySafeSql({ sql, template: sql });
  const manifest = {
    schemaVersion: 1,
    artifactType: "synthetic-production-shaped",
    sanitizerVersion: policy.sanitizerVersion,
    provenance: {
      generator: policy.generator,
      gitCommit,
      sourceKind: policy.sourceKind,
      sourceDate,
      sourceExportSha256: sha256(rawExport),
      sourceDatabaseIdSha256: sha256(sourceDatabaseId),
      generatedAt: generatedAt.toISOString(),
      issueNumber,
      verification: "unverified-request-metadata",
    },
    requestMetadata: {
      requestedApproverIdentity,
      requestedPurpose: "staging-rehearsal-only",
      verification: "unverified-request-metadata",
    },
    retentionDeadline,
    artifact: {
      sha256: sha256(sql),
      byteLength: Buffer.byteLength(sql),
      templateSha256: sha256(sql),
    },
    privacy: {
      profile: "repo-owned-synthetic-only",
      directIdentifiers: "none",
      privateContent: "none",
    },
    manifestIntegritySha256: "",
  };
  manifest.manifestIntegritySha256 = integrityDigestFor(manifest);
  validateSanitizedRehearsalArtifact({ sql, manifest, policy, now: generatedAt });
  return { sql, manifest };
}

export function validateSanitizedRehearsalArtifact({ sql, manifest, policy, now }) {
  const parsed = manifestSchema.safeParse(manifest);
  if (!parsed.success) {
    throw new Error(`Strict sanitizer manifest rejected unrecognized or invalid fields: ${parsed.error.message}`);
  }
  const value = parsed.data;
  if (value.sanitizerVersion !== policy.sanitizerVersion) {
    throw new Error(`Sanitizer version is not allowlisted: ${value.sanitizerVersion}.`);
  }
  if (value.provenance.generator !== policy.generator || value.provenance.sourceKind !== policy.sourceKind) {
    throw new Error("Sanitizer provenance does not match the repo-owned generator policy.");
  }
  if (!policy.allowedRequestedApproverIdentities.includes(
    value.requestMetadata.requestedApproverIdentity,
  )) {
    throw new Error(
      `Manifest does not name an allowlisted requested approver identity: ${value.requestMetadata.requestedApproverIdentity}.`,
    );
  }
  const productionDatabaseId = JSON.parse(
    readFileSync(path.join(policy.__repoRoot, "scripts/data/environment-inventory.json"), "utf8"),
  ).environments.production.databaseId;
  if (value.provenance.sourceDatabaseIdSha256 !== sha256(productionDatabaseId)) {
    throw new Error("Manifest source identity does not match the checked-in production database.");
  }
  const generatedAt = new Date(value.provenance.generatedAt);
  const deadline = new Date(value.retentionDeadline);
  const maximum = new Date(generatedAt.getTime() + policy.maximumRetentionHours * 60 * 60 * 1000);
  if (generatedAt > now || deadline <= now || deadline > maximum) {
    throw new Error(`Sanitized rehearsal retention must end within ${policy.maximumRetentionHours} hours of generation.`);
  }
  const template = loadTemplate({ repoRoot: path.resolve(policy.__repoRoot ?? "."), policy });
  assertPrivacySafeSql({ sql, template });
  if (
    value.artifact.sha256 !== sha256(sql) ||
    value.artifact.byteLength !== Buffer.byteLength(sql) ||
    value.artifact.templateSha256 !== sha256(template)
  ) {
    throw new Error("Sanitized artifact bytes do not match the strict manifest integrity fields.");
  }
  if (value.manifestIntegritySha256 !== integrityDigestFor(value)) {
    throw new Error("Sanitizer manifest integrity digest is invalid.");
  }
  return value;
}
