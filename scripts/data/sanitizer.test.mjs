import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { replayMigrations } from "./schema-contract.ts";
import { syntheticSourceDatabase, exportSyntheticRows } from "./sanitizer-test-source.mjs";
import { sanitizedState, verifySanitizedTransformation, validateSanitizedStateBinding } from "./sanitized-state-lib.mjs";
import { listMigrationFiles } from "./schema-contract.ts";
import { parseLegacySections } from "../../src/lib/schemas/legacyChecklistSchema.ts";
import { generateSanitizedRehearsalArtifact, loadSanitizerPolicy, normalizeRehearsalDataExport, validateSanitizedRehearsalArtifact } from "./sanitizer-lib.mjs";

const repoRoot = new URL("../..", import.meta.url).pathname;
const rawExport = readFileSync(path.join(repoRoot, "scripts/data/fixtures/production-export-edge-cases.sql"), "utf8");
const generatedAt = new Date("2026-09-05T00:00:00.000Z");
const retentionDeadline = "2026-09-05T12:00:00.000Z";
const sourceDatabaseId = "b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1";
const gitCommit = "0123456789abcdef0123456789abcdef01234567";
const legacyContext = { migrationRange: { from: "0024_safe_template_evolution.sql", to: "0024_safe_template_evolution.sql" }, sourceSchema: "0023_add_sitemap_revision_state.sql" };
const currentContext = { migrationRange: { from: null, to: null }, sourceSchema: "0024_safe_template_evolution.sql" };
function generate(overrides = {}) { return generateSanitizedRehearsalArtifact({ repoRoot, rawExport, sourceDatabaseId, sourceDate: "2026-09-05", gitCommit, issueNumber: 95, requestedApproverIdentity: "@devinschumacher", generatedAt, retentionDeadline, ...legacyContext, ...overrides }); }
function addSourceLedgerTable(database) { database.exec("CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)"); }

// Synthetic source fixture, exported from actual SQLite migration results.
// This is additional edge-case testing, not observed production coverage.
function exportRows(database) {
  const tables = ["users", "templates", "checklist_runs"];
  if (database.prepare("SELECT name FROM sqlite_schema WHERE name='d1_migrations'").get()) tables.push("d1_migrations");
  return tables.flatMap((table) => database.prepare(`SELECT * FROM ${table}`).all().map((row) =>
    `INSERT INTO ${table} (${Object.keys(row).join(",")}) VALUES (${Object.values(row).map((value) => value == null ? "NULL" : typeof value === "number" ? value : `'${String(value).replaceAll("'", "''")}'`).join(",")});`
  )).join("\n");
}

function oversizedPersonalSource(current, secondOwner = true) {
  const source = syntheticSourceDatabase(repoRoot, current);
  source.exec("DELETE FROM checklist_runs; DELETE FROM templates");
  const ownerA = source.prepare("SELECT id FROM users LIMIT 1").get().id;
  const ownerB = secondOwner ? "PRIVATE_OWNER_B" : ownerA;
  if (secondOwner) source.exec("INSERT INTO users(id,email,created_at) VALUES('PRIVATE_OWNER_B','private-b@example.test','2020-01-01')");
  // Reproduce the review's adversarial input: B sorts beyond both fill limits.
  const orderedIds = (family, count) => Array.from({ length: count }, (_, i) => `PRIVATE_${family}_${i}`).sort((a, b) => createHash("sha256").update(a).digest("hex").localeCompare(createHash("sha256").update(b).digest("hex")));
  const templates = orderedIds("TEMPLATE", 17), runs = orderedIds("RUN", 25);
  templates.forEach((id, i) => source.prepare("INSERT INTO templates(id,user_id,title,items,slug,version,created_at) VALUES(?,?,'Private','[]',?,?, '2020-01-01')").run(id, i === 16 ? ownerB : ownerA, id, i === 16 ? 702 : 701));
  runs.forEach((id, i) => source.prepare("INSERT INTO checklist_runs(id,user_id,template_id,title,items,progress,created_at,started_at) VALUES(?,?,?,'Private','[]',?,'2020-01-01','2020-01-01')").run(id, i === 24 ? ownerB : ownerA, i === 24 ? templates[16] : templates[0], i === 24 ? 72 : 71));
  return source;
}

it("accepts an actual post0024 export for application-only rehearsal without inventing legacy shapes", () => {
  const database = replayMigrations({ through: "0023_add_sitemap_revision_state.sql" });
  try {
    addSourceLedgerTable(database);
    database.exec(rawExport);
    database.exec(readFileSync(path.join(repoRoot, "db/migrations/0024_safe_template_evolution.sql"), "utf8"));
    database.prepare("INSERT INTO d1_migrations(id,name,applied_at) VALUES (24,?,?)").run("0024_safe_template_evolution.sql", "2026-09-05");
    const artifact = normalizeRehearsalDataExport({ repoRoot, rawExport: exportRows(database), migrationRange: { from: null, to: null }, sourceSchema: "0024_safe_template_evolution.sql" });
    expect(artifact.coveredShapes).not.toContain("legacy-flat-items");
    expect(artifact.sql).toContain("content_version");
    expect(artifact.sql).toContain("retired_items");
  } finally { database.close(); }
});

describe("source-derived rehearsal sanitizer", () => {
  it.each([false, true])("preserves zero and negative source versions (current=%s)", current => {
    const context = current ? currentContext : legacyContext;
    const source = syntheticSourceDatabase(repoRoot, current), target = replayMigrations({ through: context.sourceSchema });
    try {
      source.exec("UPDATE templates SET version=0");
      if (current) source.exec("UPDATE templates SET content_version=-7; UPDATE checklist_runs SET template_version=0, revision=-3");
      const exported = exportSyntheticRows(source);
      const artifact = normalizeRehearsalDataExport({ repoRoot, rawExport: exported, ...context });
      target.exec(artifact.sql);
      expect(target.prepare("SELECT version FROM templates").all()).toEqual([{ version: 0 }, { version: 0 }]);
      if (current) {
        expect(target.prepare("SELECT content_version FROM templates").all()).toEqual([{ content_version: -7 }, { content_version: -7 }]);
        expect(target.prepare("SELECT template_version,revision FROM checklist_runs").all()).toEqual([{ template_version: 0, revision: -3 }, { template_version: 0, revision: -3 }]);
      }
      expect(exportSyntheticRows(source)).toBe(exported);
    } finally { source.close(); target.close(); }
  });
  it.each([false, true])("preserves finite fractional, out-of-range and null progress (current=%s)", current => {
    const context = current ? currentContext : legacyContext;
    for (const value of [-1, 0, 12.375, 100, 101, null]) {
      const source = syntheticSourceDatabase(repoRoot, current), target = replayMigrations({ through: context.sourceSchema });
      try {
        source.prepare("UPDATE checklist_runs SET progress=?").run(value);
        const exported = exportSyntheticRows(source);
        const artifact = generate({ ...context, rawExport: exported });
        target.exec(artifact.sql);
        expect(target.prepare("SELECT progress FROM checklist_runs").all()).toEqual([{ progress: value }, { progress: value }]);
        expect(exportSyntheticRows(source)).toBe(exported);
      } finally { source.close(); target.close(); }
    }
  });
  it.each([false, true])("rejects unsupported lifecycle scalar storage without disclosing values (current=%s)", current => {
    const context = current ? currentContext : legacyContext;
    const columns = [["templates", "version"], ["checklist_runs", "progress"], ["templates", "is_public"], ["checklist_runs", "is_public"],
      ...(current ? [["templates", "content_version"], ["checklist_runs", "template_version"], ["checklist_runs", "revision"]] : [])];
    for (const [table, column] of columns) for (const literal of ["'PRIVATE_SCALAR_VALUE'", "X'50524956415445'", "1e999", "9007199254740993",
      ...(column === "progress" ? [] : ["1.25"]), ...(column === "is_public" ? ["-1", "2"] : [])]) {
      const source = syntheticSourceDatabase(repoRoot, current);
      try {
        // Insert the literal into exported SQL so SQLite, not a JS fixture serializer, reads its storage representation.
        const row = source.prepare(`SELECT * FROM ${table} LIMIT 1`).get();
        const exported = exportSyntheticRows(source);
        const original = exported.split("\n").find(line => line.startsWith(`INSERT INTO ${table} (`));
        const values = Object.entries(row).map(([key, value]) => key === column ? literal : value == null ? "NULL" : typeof value === "number" ? String(value) : "'" + String(value).replaceAll("'", "''") + "'");
        const changed = exported.replace(original, `INSERT INTO ${table} (${Object.keys(row).join(",")}) VALUES (${values.join(",")});`);
        let error;
        try { normalizeRehearsalDataExport({ repoRoot, rawExport: changed, ...context }); } catch (caught) { error = caught; }
        expect(error, `${table}.${column}: ${literal}`).toBeInstanceOf(Error);
        expect(error.message).not.toMatch(/PRIVATE|505249|9007199254740993/);
        expect(error.message).not.toContain(row.id);
      } finally { source.close(); }
    }
  });
  it.each([false, true])("preserves nullable visibility flags exactly (current=%s)", current => {
    const context = current ? currentContext : legacyContext;
    for (const value of [null, 0, 1]) {
      const source = syntheticSourceDatabase(repoRoot, current), target = replayMigrations({ through: context.sourceSchema });
      try {
        source.prepare("UPDATE templates SET is_public=?").run(value);
        source.prepare("UPDATE checklist_runs SET is_public=?").run(value);
        target.exec(generate({ ...context, rawExport: exportSyntheticRows(source) }).sql);
        for (const table of ["templates", "checklist_runs"]) expect(target.prepare(`SELECT is_public FROM ${table}`).all()).toEqual([{ is_public: value }, { is_public: value }]);
      } finally { source.close(); target.close(); }
    }
  });
  it("preserves recognized JSON semantic numbers without clamping or exposing unrelated numbers", () => {
    const source = syntheticSourceDatabase(repoRoot, true), target = replayMigrations();
    try {
      source.prepare("UPDATE templates SET items=?").run(JSON.stringify([{ id: "private-section", order: -2000000.25, version: 9007199254740991, value: 8765432101234, items: [] }]));
      const artifact = generate({ ...currentContext, rawExport: exportSyntheticRows(source) });
      target.exec(artifact.sql);
      const item = JSON.parse(target.prepare("SELECT items FROM templates LIMIT 1").get().items)[0];
      expect(item).toMatchObject({ order: -2000000.25, version: 9007199254740991 });
      expect(item.value).not.toBe(8765432101234);
      expect(() => validateSanitizedRehearsalArtifact({ ...artifact, policy: loadSanitizerPolicy({ repoRoot }), now: generatedAt, ...currentContext })).not.toThrow();
    } finally { source.close(); target.close(); }
  });
  it.each([false, true])("rejects unsupported semantic JSON numbers before returning an artifact (current=%s)", current => {
    const context = current ? currentContext : legacyContext;
    for (const literal of ["1e999", "9007199254740993", "1e-999", "9007199254740991.1", "1.00000000000000001", "-9007199254740991.1", "0.10000000000000001", "100000000000000001e-17", "4.9e-324", "9007199254740992.0"]) {
      const source = syntheticSourceDatabase(repoRoot, current);
      try {
        source.prepare("UPDATE templates SET items=?").run(`[{"id":"PRIVATE_SECTION","items":[],"order":${literal}}]`);
        const exported = exportSyntheticRows(source);
        expect(() => generate({ ...context, rawExport: exported })).toThrow("Production-shaped source contains an unsupported semantic JSON number representation.");
        expect(exportSyntheticRows(source)).toBe(exported);
      } finally { source.close(); }
    }
  });
  it.each([false, true])("preserves equivalent decimal tokens through generator and validator (current=%s)", current => {
    const context = current ? currentContext : legacyContext;
    const cases = [
      ["1.0", "1"], ["0.10", "0.1"], ["1e3", "1000"], ["1.2300E+2", "123"],
      ["-2000000.2500", "-2000000.25"], ["12.3750", "12.375"],
      ["9007199254740991.0", "9007199254740991"], ["-9007199254740991.00", "-9007199254740991"],
      ["9.007199254740991e15", "9007199254740991"], ["1.00000000000000000", "1"],
      ["1e-7", "1e-7"], ["0.0000010", "0.000001"], ["5.00e-324", "5e-324"],
      ["-0.0", "0"], ["0e999999999999999999999", "0"],
    ];
    const source = syntheticSourceDatabase(repoRoot, current);
    try {
      for (const [token, serialized] of cases) {
        source.prepare("UPDATE templates SET items=?").run(`[{"id":"PRIVATE_SECTION","items":[],"order":${token},"version":${token},"fileSize":${token}}]`);
        const artifact = generate({ ...context, rawExport: exportSyntheticRows(source) });
        for (const key of ["order", "version", "fileSize"]) expect(artifact.sql).toContain(`"${key}":${serialized}`);
        expect(() => validateSanitizedRehearsalArtifact({ ...artifact, policy: loadSanitizerPolicy({ repoRoot }), now: generatedAt, ...context })).not.toThrow();
      }
    } finally { source.close(); }
  });
  it.each([false, true])("rejects decimal loss on an unsampled source row (current=%s)", current => {
    const context = current ? currentContext : legacyContext;
    const source = oversizedPersonalSource(current, false);
    try {
      source.exec("UPDATE checklist_runs SET progress=73 WHERE progress=72");
      const baseline = generate({ ...context, rawExport: exportSyntheticRows(source) });
      expect(baseline.manifest.selection.sourceCounts.checklistRuns).toBe(25);
      expect(baseline.manifest.selection.selectedCounts.checklistRuns).toBe(24);
      expect(baseline.sql).not.toContain(", 73,");
      for (const token of ["9007199254740991.1", "1.00000000000000001"]) {
        source.prepare("UPDATE checklist_runs SET items=? WHERE progress=73").run(`[{"id":"PRIVATE_UNSAMPLED","items":[],"order":${token}}]`);
        const exported = exportSyntheticRows(source);
        expect(() => generate({ ...context, rawExport: exported })).toThrow("Production-shaped source contains an unsupported semantic JSON number representation.");
        expect(exportSyntheticRows(source)).toBe(exported);
      }
    } finally { source.close(); }
  });
  it.each([false, true])("rejects rehashed artifacts containing decimal loss (current=%s)", current => {
    const context = current ? currentContext : legacyContext;
    const source = syntheticSourceDatabase(repoRoot, current);
    try {
      source.prepare("UPDATE templates SET items=?").run('[{"id":"PRIVATE_SECTION","items":[],"order":1,"version":1,"fileSize":1}]');
      const artifact = generate({ ...context, rawExport: exportSyntheticRows(source) });
      for (const key of ["order", "version", "fileSize"]) for (const token of ["9007199254740991.1", "1.00000000000000001", "0.10000000000000001", "4.9e-324"]) {
        const changed = structuredClone(artifact);
        changed.sql = changed.sql.replace(`"${key}":1`, `"${key}":${token}`);
        expect(changed.sql).not.toBe(artifact.sql);
        const hash = text => createHash("sha256").update(text).digest("hex");
        changed.manifest.artifact = { sha256: hash(changed.sql), byteLength: Buffer.byteLength(changed.sql) };
        const { manifestIntegritySha256: ignored, ...unsigned } = changed.manifest;
        changed.manifest.manifestIntegritySha256 = hash(JSON.stringify(unsigned));
        expect(() => validateSanitizedRehearsalArtifact({ ...changed, policy: loadSanitizerPolicy({ repoRoot }), now: generatedAt, ...context })).toThrow("Sanitized artifact could not be verified against the repository schema.");
      }
    } finally { source.close(); }
  });
  it.each([false, true])("rejects explicit exports omitting lifecycle scalars while retaining positional exports (current=%s)", current => {
    const context = current ? currentContext : legacyContext;
    const source = syntheticSourceDatabase(repoRoot, current);
    try {
      const exported = exportSyntheticRows(source);
      const expected = normalizeRehearsalDataExport({ repoRoot, rawExport: exported, ...context });
      const positional = exported.replace(/^(INSERT INTO [a-z_]+) \([^\n]+?\) VALUES/gm, '$1 VALUES');
      expect(normalizeRehearsalDataExport({ repoRoot, rawExport: positional, ...context }).sql).toBe(expected.sql);
      for (const [table, columns] of [["templates", ["version", "is_public", "type", ...(current ? ["content_version"] : [])]], ["checklist_runs", ["progress", "is_public", "status", ...(current ? ["template_version", "revision"] : [])]]]) {
        const row = source.prepare(`SELECT * FROM ${table} LIMIT 1`).get();
        const original = exported.split("\n").find(line => line.startsWith(`INSERT INTO ${table} (`));
        for (const omitted of columns) {
          const entries = Object.entries(row).filter(([key]) => key !== omitted);
          const values = entries.map(([, value]) => value == null ? "NULL" : typeof value === "number" ? String(value) : "'" + String(value).replaceAll("'", "''") + "'");
          const changed = exported.replace(original, `INSERT INTO ${table} (${entries.map(([key]) => key).join(",")}) VALUES (${values.join(",")});`);
          expect(() => normalizeRehearsalDataExport({ repoRoot, rawExport: changed, ...context }), `${table}.${omitted}`).toThrow(/omits.*columns/);
        }
      }
    } finally { source.close(); }
  });
  it.each([false, true])("reserves distinct personal owners beyond both shape-sample thresholds (current=%s)", current => {
    const context = current ? currentContext : legacyContext;
    const source = oversizedPersonalSource(current), target = replayMigrations({ through: context.sourceSchema });
    try {
      const exported = exportSyntheticRows(source);
      const artifact = generate({ ...context, rawExport: exported });
      expect(artifact.manifest.selection.sourceCounts).toMatchObject({ users: 2, templates: 17, checklistRuns: 25 });
      expect(artifact.manifest.selection.selectedCounts).toMatchObject({ users: 2, checklistRuns: 24 });
      target.exec(artifact.sql);
      expect(target.prepare("SELECT COUNT(DISTINCT user_id) n FROM templates WHERE owner_type='user'").get().n).toBe(2);
      expect(target.prepare("SELECT COUNT(DISTINCT user_id) n FROM checklist_runs WHERE team_id IS NULL").get().n).toBe(2);
      const b = target.prepare("SELECT user_id FROM templates WHERE version=702").get();
      expect(b).toBeDefined();
      expect(target.prepare("SELECT r.user_id, t.user_id template_owner, t.version FROM checklist_runs r JOIN templates t ON t.id=r.template_id WHERE r.progress=72").get()).toEqual({ user_id: b.user_id, template_owner: b.user_id, version: 702 });
      expect(target.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      expect(generate({ ...context, rawExport: exported }).sql).toBe(artifact.sql);
      expect(generate({ ...context, rawExport: exported.split("\n").reverse().join("\n") }).sql).toBe(artifact.sql);
      expect(artifact.sql).not.toMatch(/PRIVATE_|private-b/);
      expect(() => validateSanitizedRehearsalArtifact({ ...artifact, policy: loadSanitizerPolicy({ repoRoot }), now: generatedAt, ...context })).not.toThrow();
    } finally { source.close(); target.close(); }
  });
  it.each([false, true])("retains bounded single-owner samples without inventing another principal (current=%s)", current => {
    const context = current ? currentContext : legacyContext;
    const source = oversizedPersonalSource(current, false), target = replayMigrations({ through: context.sourceSchema });
    try {
      const artifact = generate({ ...context, rawExport: exportSyntheticRows(source) });
      target.exec(artifact.sql);
      expect(artifact.manifest.selection.selectedCounts).toMatchObject({ users: 1, templates: 16, checklistRuns: 24 });
      expect(target.prepare("SELECT COUNT(*) n FROM users").get().n).toBe(1);
      expect(target.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally { source.close(); target.close(); }
  });
  it.each(["templates", "checklist_runs"])("reserves a personal-owner pair independently in the %s family", family => {
    const source = oversizedPersonalSource(true), target = replayMigrations();
    try {
      if (family === "templates") source.exec("UPDATE checklist_runs SET user_id=(SELECT user_id FROM templates WHERE version=701 LIMIT 1), template_id=(SELECT id FROM templates WHERE version=701 LIMIT 1)");
      else source.exec("UPDATE templates SET user_id=(SELECT user_id FROM checklist_runs WHERE progress=71 LIMIT 1)");
      const artifact = generate({ ...currentContext, rawExport: exportSyntheticRows(source) });
      target.exec(artifact.sql);
      expect(target.prepare(`SELECT COUNT(DISTINCT user_id) n FROM ${family}`).get().n).toBe(2);
      const other = family === "templates" ? "checklist_runs" : "templates";
      expect(target.prepare(`SELECT COUNT(DISTINCT user_id) n FROM ${other}`).get().n).toBe(1);
      expect(target.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally { source.close(); target.close(); }
  });
  it("fails explicitly when the personal-owner pair and lifecycle signatures exceed the run cap", () => {
    const source = oversizedPersonalSource(true);
    try {
      const rows = source.prepare("SELECT id FROM checklist_runs WHERE progress=71").all().sort((a, b) => createHash("sha256").update(a.id).digest("hex").localeCompare(createHash("sha256").update(b.id).digest("hex")));
      rows.forEach((row, i) => source.prepare("UPDATE checklist_runs SET status=? WHERE id=?").run(`PRIVATE_STATUS_${i}`, row.id));
      source.exec("UPDATE checklist_runs SET status='PRIVATE_STATUS_0' WHERE progress=72");
      expect(() => generate({ ...currentContext, rawExport: exportSyntheticRows(source) })).toThrow("Production-shaped sample cannot fit personal-owner representatives and observed shapes within its bounds.");
    } finally { source.close(); }
  });
  it("rejects an unsupported scalar even on a row beyond the general fill limit", () => {
    const source = oversizedPersonalSource(true, false);
    try {
      source.exec("UPDATE checklist_runs SET progress='PRIVATE_UNSAMPLED_VALUE' WHERE progress=72");
      expect(() => generate({ ...currentContext, rawExport: exportSyntheticRows(source) })).toThrow("Production-shaped source contains an unsupported lifecycle scalar type or representation.");
    } finally { source.close(); }
  });
  it("fails explicitly when reserved owner relations cannot fit the finite cohort", () => {
    const source = oversizedPersonalSource(true);
    try {
      source.exec("INSERT INTO teams(id,name,created_by_user_id,created_at) SELECT 'PRIVATE_TEAM','Private',id,'2020-01-01' FROM users LIMIT 1");
      source.exec("UPDATE checklist_runs SET team_id='PRIVATE_TEAM' WHERE progress=71");
      // Selected team membership is relational closure, including every member.
      for (let i = 0; i < 97; i++) {
        source.prepare("INSERT INTO users(id,email,created_at) VALUES(?,?,'2020-01-01')").run(`PRIVATE_EXTRA_${i}`, `private-extra-${i}@example.test`);
        source.prepare("INSERT INTO team_members(id,team_id,user_id,role,status,created_at) VALUES(?,'PRIVATE_TEAM',?,'viewer','active','2020-01-01')").run(`PRIVATE_LINK_${i}`, `PRIVATE_EXTRA_${i}`);
      }
      expect(() => generate({ ...currentContext, rawExport: exportSyntheticRows(source) })).toThrow(/bounds/);
    } finally { source.close(); }
  });
  it("samples many personal owners within caps rather than reserving every owner", () => {
    const source = oversizedPersonalSource(true), target = replayMigrations();
    try {
      source.exec("UPDATE checklist_runs SET template_id=(SELECT id FROM templates WHERE version=701 LIMIT 1)");
      for (let i = 0; i < 30; i++) {
        source.prepare("INSERT INTO users(id,email,created_at) VALUES(?,?,'2020-01-01')").run(`PRIVATE_MANY_${i}`, `private-many-${i}@example.test`);
        source.prepare("INSERT INTO checklist_runs(id,user_id,title,items,created_at,started_at) VALUES(?,?,'Private','[]','2020-01-01','2020-01-01')").run(`PRIVATE_MANY_RUN_${i}`, `PRIVATE_MANY_${i}`);
      }
      const artifact = generate({ ...currentContext, rawExport: exportSyntheticRows(source) });
      target.exec(artifact.sql);
      expect(artifact.manifest.selection.selectedCounts.checklistRuns).toBe(24);
      expect(target.prepare("SELECT COUNT(DISTINCT user_id) n FROM checklist_runs").get().n).toBeGreaterThanOrEqual(2);
      expect(artifact.manifest.selection.selectedCounts.users).toBeLessThan(32);
      expect(target.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally { source.close(); target.close(); }
  });
  it.each([false, true])("round-trips safe version boundaries and rejects rehashed scalar tampering (current=%s)", current => {
    const context = current ? currentContext : legacyContext;
    for (const value of [-9007199254740991, -1, 0, 1, 9007199254740991]) {
      const source = syntheticSourceDatabase(repoRoot, current), target = replayMigrations({ through: context.sourceSchema });
      try {
        source.prepare("UPDATE templates SET version=?").run(value);
        if (current) {
          source.prepare("UPDATE templates SET content_version=?").run(value);
          source.prepare("UPDATE checklist_runs SET template_version=?,revision=?").run(value, value);
        }
        const artifact = generate({ ...context, rawExport: exportSyntheticRows(source) });
        target.exec(artifact.sql);
        expect(target.prepare("SELECT version FROM templates").all()).toEqual([{ version: value }, { version: value }]);
        if (current) {
          expect(target.prepare("SELECT content_version FROM templates").all()).toEqual([{ content_version: value }, { content_version: value }]);
          expect(target.prepare("SELECT template_version,revision FROM checklist_runs").all()).toEqual([{ template_version: value, revision: value }, { template_version: value, revision: value }]);
        }
        const validate = artifact => validateSanitizedRehearsalArtifact({ ...artifact, policy: loadSanitizerPolicy({ repoRoot }), now: generatedAt, ...context });
        expect(() => validate(artifact)).not.toThrow();
        if (value === 9007199254740991) for (const replacement of ["1.25", "'PRIVATE_SCALAR'", "9007199254740993"]) {
          const changed = structuredClone(artifact);
          changed.sql = changed.sql.replace(", 9007199254740991,", `, ${replacement},`);
          expect(changed.sql).not.toBe(artifact.sql);
          const hash = value => createHash("sha256").update(value).digest("hex");
          changed.manifest.artifact = { sha256: hash(changed.sql), byteLength: Buffer.byteLength(changed.sql) };
          const { manifestIntegritySha256: ignored, ...unsigned } = changed.manifest;
          changed.manifest.manifestIntegritySha256 = hash(JSON.stringify(unsigned));
          expect(() => validate(changed)).toThrow();
        }
      } finally { source.close(); target.close(); }
    }
  });
  it("preserves two personal principals and selected team roles without source identifiers", () => {
    const source = syntheticSourceDatabase(repoRoot, false), target = replayMigrations({ through: legacyContext.sourceSchema });
    try {
      source.exec(`INSERT INTO users(id,email,created_at) VALUES('private-second-owner','private-second@example.test','2020-01-01');
        INSERT INTO teams(id,name,created_by_user_id,created_at) SELECT 'private-team','Private Team',id,'2020-01-01' FROM users WHERE id!='private-second-owner' LIMIT 1;
        INSERT INTO team_members(id,team_id,user_id,role,status,created_at) SELECT 'private-member-owner','private-team',created_by_user_id,'owner','active','2020-01-01' FROM teams;
        INSERT INTO team_members(id,team_id,user_id,role,status,created_at) VALUES('private-member-viewer','private-team','private-second-owner','viewer','active','2020-01-01');
        UPDATE templates SET owner_type='team',team_id='private-team' WHERE id=(SELECT id FROM templates ORDER BY id LIMIT 1);
        UPDATE checklist_runs SET user_id='private-second-owner' WHERE id=(SELECT id FROM checklist_runs ORDER BY id LIMIT 1);`);
      const artifact = generate({ rawExport: exportSyntheticRows(source) });
      target.exec(artifact.sql);
      expect(target.prepare("SELECT COUNT(*) n FROM users").get().n).toBe(2);
      expect(target.prepare("SELECT role,status FROM team_members ORDER BY role").all()).toEqual([{ role: 'owner', status: 'active' }, { role: 'viewer', status: 'active' }]);
      expect(target.prepare("SELECT owner_type,team_id FROM templates WHERE owner_type='team'").get()).toEqual({ owner_type: 'team', team_id: 'rehearsal-team-1' });
      expect(artifact.manifest.selection.selectedCounts.teams).toBe(1);
      expect(artifact.sql).not.toMatch(/private-|Private Team/);
      expect(() => validateSanitizedRehearsalArtifact({ sql: artifact.sql, manifest: artifact.manifest, policy: loadSanitizerPolicy({ repoRoot }), now: generatedAt, ...legacyContext })).not.toThrow();
    } finally { source.close(); target.close(); }
  });
  it.each([
    "UPDATE templates SET created_by_user_id='PRIVATE_MISSING_PRINCIPAL'",
    "UPDATE templates SET owner_type='team',team_id='PRIVATE_ORPHAN_TEAM'",
    "UPDATE checklist_runs SET template_id='PRIVATE_ORPHAN_TEMPLATE'",
    "UPDATE templates SET owner_type='PRIVATE_INVALID_OWNER'",
  ])('refuses unresolved or malformed source ownership without repairing source rows: %s', sql => {
    const source = syntheticSourceDatabase(repoRoot, false);
    try {
      source.exec('PRAGMA foreign_keys=OFF'); source.exec(sql);
      const exported = exportSyntheticRows(source);
      expect(() => normalizeRehearsalDataExport({ repoRoot, rawExport: exported, ...legacyContext })).toThrow();
      expect(exportSyntheticRows(source)).toBe(exported);
    } finally { source.close(); }
  });
  it('refuses a relational cohort beyond its membership cap instead of deleting memberships', () => {
    const source = syntheticSourceDatabase(repoRoot, false);
    try {
      const owner = source.prepare('SELECT id FROM users LIMIT 1').get().id;
      source.prepare("INSERT INTO teams(id,name,created_by_user_id,created_at) VALUES('PRIVATE_LARGE_TEAM','Private',?,'2020-01-01')").run(owner);
      source.exec("UPDATE templates SET owner_type='team',team_id='PRIVATE_LARGE_TEAM'");
      for (let i = 0; i < 97; i++) {
        source.prepare("INSERT INTO users(id,email,created_at) VALUES(?,?,'2020-01-01')").run(`PRIVATE_MEMBER_${i}`, `member${i}@private.example`);
        source.prepare("INSERT INTO team_members(id,team_id,user_id,role,status,created_at) VALUES(?,'PRIVATE_LARGE_TEAM',?,'viewer','active','2020-01-01')").run(`PRIVATE_LINK_${i}`, `PRIVATE_MEMBER_${i}`);
      }
      expect(() => normalizeRehearsalDataExport({ repoRoot, rawExport: exportSyntheticRows(source), ...legacyContext })).toThrow(/bounds/);
      expect(source.prepare('SELECT COUNT(*) n FROM team_members').get().n).toBe(97);
    } finally { source.close(); }
  });
  it('preserves absent creators rather than fabricating an owner authorization relation', () => {
    const source = syntheticSourceDatabase(repoRoot, false), target = replayMigrations({ through: legacyContext.sourceSchema });
    try {
      source.exec('UPDATE templates SET created_by_user_id=NULL; UPDATE checklist_runs SET created_by_user_id=NULL');
      target.exec(generate({ rawExport: exportSyntheticRows(source) }).sql);
      expect(target.prepare('SELECT COUNT(*) n FROM templates WHERE created_by_user_id IS NOT NULL').get().n).toBe(0);
      expect(target.prepare('SELECT COUNT(*) n FROM checklist_runs WHERE created_by_user_id IS NOT NULL').get().n).toBe(0);
    } finally { source.close(); target.close(); }
  });
  it.each([
    ['templates', 'type', 'recipe', 'recipe'],
    ['templates', 'type', 'checklist', 'checklist'],
    ['templates', 'type', 'workflow', 'workflow'],
    ['templates', 'type', 'PRIVATE_TEMPLATE_KIND', 'sanitized-enum'],
    ['templates', 'type', '', ''],
    ['checklist_runs', 'status', 'in_progress', 'in_progress'],
    ['checklist_runs', 'status', 'completed', 'completed'],
    ['checklist_runs', 'status', 'not_started', 'not_started'],
    ['checklist_runs', 'status', 'PRIVATE_RUN_STATE', 'sanitized-enum'],
  ])('preserves scalar enum semantics without repairing invalid %s.%s=%s', (table, column, value, expected) => {
    const source = syntheticSourceDatabase(repoRoot, false);
    const target = replayMigrations({ through: legacyContext.sourceSchema });
    try {
      source.prepare(`UPDATE ${table} SET ${column}=?`).run(value);
      const artifact = generate({ rawExport: exportSyntheticRows(source) });
      target.exec(artifact.sql);
      expect(target.prepare(`SELECT ${column} AS value FROM ${table}`).all()).toEqual([{ value: expected }, { value: expected }]);
      expect(artifact.sql).not.toContain('PRIVATE_TEMPLATE_KIND');
      expect(artifact.sql).not.toContain('PRIVATE_RUN_STATE');
    } finally { source.close(); target.close(); }
  });
  it("retains duplicate identities and malformed nested shapes without making them writable", () => {
    const source = syntheticSourceDatabase(repoRoot, false), target = replayMigrations({ through: legacyContext.sourceSchema });
    try {
      const malformed = [{ id: "private-section", items: [
        { id: "private-duplicate", contents: [{ type: "private-invalid", value: "private-value" }] },
        { id: "private-duplicate", contents: { type: "text", value: "private-value" } },
        { id: null, contents: [null, { type: false, subItems: "private-invalid-array" }] },
      ] }];
      expect(parseLegacySections(malformed).success).toBe(false);
      source.prepare("UPDATE templates SET items=?").run(JSON.stringify(malformed));
      const artifact = generate({ ...legacyContext, rawExport: exportSyntheticRows(source) });
      target.exec(artifact.sql);
      const result = JSON.parse(target.prepare("SELECT items FROM templates LIMIT 1").get().items);
      expect(parseLegacySections(result).success).toBe(false);
      expect(result[0].items).toHaveLength(3);
      expect(result[0].items[0].id).toBe(result[0].items[1].id);
      expect(Array.isArray(result[0].items[1].contents)).toBe(false);
      expect(result[0].items[2]).toEqual({ id: null, contents: [null, { type: false, subItems: "sanitized-subItems" }] });
      expect(artifact.sql).not.toContain("private-");
    } finally { source.close(); target.close(); }
  });
  it("preserves typed repeated and distinct identifiers across reordered templates, runs and retired items", () => {
    const source = syntheticSourceDatabase(repoRoot, true);
    const target = replayMigrations();
    try {
      const sections = [{ id: "private-section-identity", title: "private-title", items: [
        { id: "private-first-identity", title: "private-title", contents: [{ id: "private-content-identity", type: "subItems", value: "", subItems: [{ id: 987654321012345, title: "private-child" }] }] },
        { id: "private-second-identity", title: "private-title", contents: [{ id: "private-other-content", type: "text", value: "private-value" }] },
      ] }];
      source.prepare("UPDATE templates SET items=?").run(JSON.stringify(sections));
      const reordered = structuredClone(sections); reordered[0].items.reverse();
      source.prepare("UPDATE checklist_runs SET items=?, retired_items=?").run(JSON.stringify(reordered), JSON.stringify([sections[0].items[0], { id: "987654321012345" }, { id: 123456789012345 }, { id: "" }, { id: null }, { id: false }]));
      const artifact = generate({ ...currentContext, rawExport: exportSyntheticRows(source) });
      target.exec(artifact.sql);
      const templates = target.prepare("SELECT items FROM templates").all().map(row => JSON.parse(row.items));
      const run = target.prepare("SELECT items, retired_items FROM checklist_runs LIMIT 1").get();
      const items = JSON.parse(run.items)[0].items, retired = JSON.parse(run.retired_items);
      expect(templates[0]).toEqual(templates[1]);
      expect(items[1]).toEqual(templates[0][0].items[0]);
      expect(items[0].id).not.toBe(items[1].id);
      expect(items[0].contents[0].id).not.toBe(items[1].contents[0].id);
      expect(retired[0]).toEqual(items[1]);
      const numeric = items[1].contents[0].subItems[0].id;
      expect(typeof numeric).toBe("number");
      expect(typeof retired[1].id).toBe("string");
      expect(retired[2].id).not.toBe(numeric);
      expect(retired.slice(3)).toEqual([{ id: "" }, { id: null }, { id: false }]);
      expect(artifact.sql).not.toMatch(/private-|987654321012345|123456789012345/);
    } finally { source.close(); target.close(); }
  });
  it("preserves allowed content and upload enums while removing private text and leaving invalid enums invalid", () => {
    const source = syntheticSourceDatabase(repoRoot, true);
    const target = replayMigrations();
    try {
      const contents = ["text", "image", "video", "file", "embed", "subItems", "private-invalid-enum"].map((type, i) => ({ id: `private-content-${i}`, type, value: "private-value", uploadType: i % 2 ? "upload" : "url", fileName: "private-file-name" }));
      contents.push({ id: "private-invalid-upload", type: "file", value: "private-value", uploadType: "private-upload-enum" });
      source.prepare("UPDATE templates SET items=?").run(JSON.stringify([{ id: "private-section", title: "private-title", items: [{ id: "private-item", title: "private-title", contents }] }]));
      const artifact = generate({ ...currentContext, rawExport: exportSyntheticRows(source) });
      target.exec(artifact.sql);
      const result = JSON.parse(target.prepare("SELECT items FROM templates LIMIT 1").get().items)[0].items[0].contents;
      expect(result.slice(0, 6).map(entry => entry.type)).toEqual(["text", "image", "video", "file", "embed", "subItems"]);
      expect(result.slice(0, 6).map(entry => entry.uploadType)).toEqual(["url", "upload", "url", "upload", "url", "upload"]);
      expect(result[6].type).toBe("sanitized-type");
      expect(result[7].uploadType).toBe("sanitized-uploadType");
      expect(artifact.sql).not.toContain("private-");
    } finally { source.close(); target.close(); }
  });
  it("keeps retired identity references and malformed whitespace identities and file sizes meaningful", () => {
    const source = syntheticSourceDatabase(repoRoot, true), target = replayMigrations();
    try {
      const section = { id: "private-section", items: [{ id: "private-item", contents: [{ id: " ", type: "file", fileSize: -8 }, { id: "private-large-file", type: "file", fileSize: 20000000 }] }] };
      source.prepare("UPDATE templates SET items=?").run(JSON.stringify([section]));
      source.prepare("UPDATE checklist_runs SET retired_items=?").run(JSON.stringify([{ kind: "item", sectionId: section.id, sectionTitle: "private-title", item: section.items[0] }]));
      const artifact = generate({ ...currentContext, rawExport: exportSyntheticRows(source) });
      target.exec(artifact.sql);
      const item = JSON.parse(target.prepare("SELECT items FROM templates LIMIT 1").get().items)[0];
      const retired = JSON.parse(target.prepare("SELECT retired_items FROM checklist_runs LIMIT 1").get().retired_items)[0];
      expect(retired).toEqual({ kind: "item", sectionId: item.id, sectionTitle: "sanitized-sectionTitle", item: item.items[0] });
      expect(item.items[0].contents[0]).toMatchObject({ id: " ", type: "file", fileSize: -8 });
      expect(item.items[0].contents[1].fileSize).toBe(20000000);
      expect(artifact.sql).not.toContain("private-");
    } finally { source.close(); target.close(); }
  });
  it("preserves source relationships and migration-edge shapes without source values", () => {
    const artifact = generate();
    expect(artifact.manifest).toMatchObject({ schemaVersion: 3, artifactType: "sanitized-production-shaped", sanitizerVersion: "source-derived-shape-v5", selection: { sourceCounts: { users: 1, templates: 2, checklistRuns: 2 }, selectedCounts: { users: 1, templates: 2, checklistRuns: 2 } }, privacy: { directIdentifiers: "removed", customerContent: "removed", credentialsAndSessions: "excluded", passwordMaterial: "excluded" }, handling: { accessOwner: "@devinschumacher", retentionDeadline } });
    expect(artifact.manifest.selection.coveredShapes).toEqual(expect.arrayContaining(artifact.manifest.selection.requiredShapes));
    for (const secret of ["private.person@example.com", "Private Person", "Customer", "Confidential", "secret note", "private-access-token", "private-session-token", "private-share-token", "8ab2b7e9", "987654321012345"]) expect(artifact.sql).not.toContain(secret);
    expect(artifact.sql).toContain('"order":17');
    expect(artifact.sql).toContain("rehearsal-template-1");
    expect(artifact.sql).toContain("rehearsal-run-1");
  });

  it("imports at 0023, applies the exact 0024 migration, and preserves valid relations", () => {
    const database = replayMigrations({ through: "0023_add_sitemap_revision_state.sql" });
    try {
      database.exec(generate().sql);
      expect(database.prepare("SELECT COUNT(*) total FROM checklist_runs r JOIN templates t ON t.id=r.template_id JOIN users u ON u.id=r.user_id").get()).toEqual({ total: 2 });
      database.exec(readFileSync(path.join(repoRoot, "db/migrations/0024_safe_template_evolution.sql"), "utf8"));
      expect(database.prepare("SELECT COUNT(*) total FROM templates WHERE content_version=version").get()).toEqual({ total: 2 });
      expect(database.prepare("SELECT COUNT(*) total FROM checklist_runs WHERE template_id IS NOT NULL AND template_version=0").get()).toEqual({ total: 2 });
      expect(database.prepare("SELECT COUNT(*) total FROM templates WHERE json_valid(items)=0").get()).toEqual({ total: 0 });
    } finally { database.close(); }
  });

  it("validates integrity, provenance, retention, owner, and shape coverage", () => {
    const artifact = generate(); const policy = loadSanitizerPolicy({ repoRoot });
    expect(() => validateSanitizedRehearsalArtifact({ ...artifact, policy, now: generatedAt, ...legacyContext })).not.toThrow();
    for (const mutate of [
      (item) => { item.manifest.sanitizerVersion = "caller-v99"; },
      (item) => { item.manifest.handling.accessOwner = "@unapproved-agent"; },
      (item) => { item.manifest.selection.coveredShapes = []; },
      (item) => { item.sql += "INSERT INTO session VALUES ('secret');"; },
    ]) { const changed = structuredClone(artifact); mutate(changed); expect(() => validateSanitizedRehearsalArtifact({ ...changed, policy, now: generatedAt, ...legacyContext })).toThrow(); }
  });

  it("fails closed for malformed, incomplete, or schema-bearing inputs", () => {
    for (const input of ["CREATE TABLE stolen(value TEXT); INSERT INTO stolen VALUES ('x');", "INSERT INTO unknown_customer_table VALUES ('x');", "INSERT INTO users (id,email) VALUES ('only-user','nobody');", rawExport.replace(/INSERT INTO checklist_runs[\s\S]*$/m, "")]) expect(() => normalizeRehearsalDataExport({ repoRoot, rawExport: input, ...legacyContext })).toThrow();
  });

  it.each([false, true])("preserves SQL-like customer strings and removes only real sqlite_sequence statements (current=%s)", (current) => {
    const context = current ? currentContext : legacyContext;
    const source = syntheticSourceDatabase(repoRoot, current);
    const phrase = "customer, value; INSERT INTO sqlite_sequence VALUES('fake', 99); -- not a comment\n/* still customer text */";
    const customerItems = JSON.stringify([{ id: "section", title: phrase, items: [{ id: "item", title: phrase, isCompleted: false }] }]);
    try {
      source.prepare("UPDATE users SET email=?, name=?, avatar_url=?, username=?, display_username=?, affiliate_code=?").run(...Array(6).fill(phrase));
      source.prepare("UPDATE templates SET title=?, description=?, items=?, category=?, tags=?, seo_title=?, seo_description=?, rules=?").run(
        phrase, phrase, customerItems, JSON.stringify([phrase]), JSON.stringify([phrase]), phrase, phrase, JSON.stringify([{ value: phrase }]),
      );
      source.prepare("UPDATE templates SET slug=? || id").run(phrase);
      source.prepare("UPDATE checklist_runs SET title=?, items=?, share_token=?").run(phrase, customerItems, phrase);
      const exported = [
        "-- INSERT INTO unknown_customer_table VALUES ('comment only');",
        "/* CREATE TABLE comment_only(value TEXT); */",
        exportSyntheticRows(source),
        "DELETE FROM sqlite_sequence;",
        "INSERT INTO `sqlite_sequence` VALUES('d1_migrations', 999);",
      ].join("\n");
      const artifact = normalizeRehearsalDataExport({ repoRoot, rawExport: exported, ...context });
      expect(artifact.sourceCounts).toEqual({ users: 1, templates: 2, checklistRuns: 2, teams: 0, teamMembers: 0 });
      expect(artifact.selectedCounts).toEqual({ users: 1, templates: 2, checklistRuns: 2, teams: 0, teamMembers: 0 });
      expect(artifact.sql).not.toContain(phrase);
    } finally { source.close(); }
  });

  it("requires the complete ordered source ledger even when a caller supplies names and the correct export hash", () => {
    const source = syntheticSourceDatabase(repoRoot, false);
    try {
      const complete = exportSyntheticRows(source);
      const withoutLedger = exportSyntheticRows(source, { includeLedger: false });
      const names = source.prepare("SELECT name FROM d1_migrations ORDER BY id").all().map((row) => row.name);
      const sourceExportSha256 = createHash("sha256").update(withoutLedger).digest("hex");
      expect(() => normalizeRehearsalDataExport({ repoRoot, rawExport: withoutLedger, ...legacyContext })).toThrow(/ledger/i);
      expect(() => normalizeRehearsalDataExport({ repoRoot, rawExport: withoutLedger, sourceLedgerCapture: { sourceExportSha256, names }, ...legacyContext })).toThrow(/ledger/i);
      expect(() => normalizeRehearsalDataExport({ repoRoot, rawExport: withoutLedger, sourceLedgerCapture: { sourceExportSha256: "0".repeat(64), names }, ...legacyContext })).toThrow(/ledger/i);
      expect(() => normalizeRehearsalDataExport({ repoRoot, rawExport: complete.replace("0023_add_sitemap_revision_state.sql", "0023_wrong.sql"), ...legacyContext })).toThrow(/ledger/i);
      expect(() => normalizeRehearsalDataExport({ repoRoot, rawExport: complete.replace(/^INSERT INTO d1_migrations[^\n]+\n/m, ""), ...legacyContext })).toThrow(/ledger/i);
    } finally { source.close(); }
  });

  it("accepts Wrangler-style replace/char values and quoted INSERT metadata", () => {
    const source = syntheticSourceDatabase(repoRoot, false);
    try {
      source.prepare("UPDATE users SET name='encoded-marker'").run();
      const encoded = exportSyntheticRows(source)
        .replace("INSERT INTO users (", "INSERT OR REPLACE INTO [users] (")
        .replace("'encoded-marker'", "replace('customer\\nINSERT INTO sqlite_sequence, -- comment; /* text */', '\\n', char(10))");
      const artifact = normalizeRehearsalDataExport({ repoRoot, rawExport: encoded, ...legacyContext });
      expect(artifact.sourceCounts).toEqual({ users: 1, templates: 2, checklistRuns: 2, teams: 0, teamMembers: 0 });
    } finally { source.close(); }
  });

  it("accepts full positional current exports but rejects omitted evolution columns", () => {
    const source = syntheticSourceDatabase(repoRoot, true);
    try {
      const explicit = exportSyntheticRows(source);
      const positional = explicit.replace(/^(INSERT INTO [a-z_]+) \([^\n]+?\) VALUES/gm, '$1 VALUES');
      expect(positional).not.toBe(explicit);
      const expected = normalizeRehearsalDataExport({ repoRoot, rawExport: explicit, ...currentContext });
      expect(normalizeRehearsalDataExport({ repoRoot, rawExport: positional, ...currentContext }).sql).toBe(expected.sql);
      const omitted = positional.replace(/^(INSERT INTO templates VALUES \()[^,]+,/m, '$1');
      expect(() => normalizeRehearsalDataExport({ repoRoot, rawExport: omitted, ...currentContext })).toThrow();
      const omittedName = explicit.replace(/^(INSERT INTO templates \([^\n]+),\s*content_version\)/m, '$1)');
      expect(omittedName).not.toBe(explicit);
      expect(() => normalizeRehearsalDataExport({ repoRoot, rawExport: omittedName, ...currentContext })).toThrow();
    } finally { source.close(); }
  });

  it("does not include authentication, billing, password, session, or share-token material", () => {
    const sql = generate().sql;
    expect(sql).not.toMatch(/INSERT INTO (?:account|session|verification|stripe_)/i);
    expect(sql).not.toContain("fixture-password-material");
    expect(sql).not.toContain("private-public-share-token");
    expect(sql).toMatch(/password_hash[^;]+VALUES \([^;]+NULL/i);
    expect(sql).toMatch(/share_token[^;]+VALUES \([^;]+NULL/i);
  });

  it("preserves current source versions and retired data; rejects rehashed privacy and metadata tampering", () => {
    const db = replayMigrations({ through: legacyContext.sourceSchema });
    try {
      addSourceLedgerTable(db);
      db.exec(rawExport);
      db.exec(readFileSync(path.join(repoRoot, "db/migrations", currentContext.sourceSchema), "utf8"));
      db.prepare("INSERT INTO d1_migrations(id,name,applied_at) VALUES (24,?,?)").run(currentContext.sourceSchema, "2026-09-05");
      db.exec("UPDATE checklist_runs SET revision=9, template_version=3, retired_items='[{\"id\":\"retired-source-id\",\"notes\":\"private retired note\"}]'");
      const artifact = generate({ ...currentContext, rawExport: exportRows(db) });
      expect(artifact.manifest.selection.absentSourceShapes).toContain("legacy-flat-items");
      expect(artifact.manifest.selection.syntheticEdgeCaseRequirements).toEqual([]);
      const target = replayMigrations();
      try {
        target.exec(artifact.sql);
        expect(target.prepare("SELECT revision,template_version FROM checklist_runs").all()).toEqual([{ revision: 9, template_version: 3 }, { revision: 9, template_version: 3 }]);
        expect(target.prepare("SELECT content_version FROM templates ORDER BY content_version").all()).toEqual(db.prepare("SELECT content_version FROM templates ORDER BY content_version").all());
        expect(JSON.parse(target.prepare("SELECT retired_items FROM checklist_runs LIMIT 1").get().retired_items)).toHaveLength(1);
      } finally { target.close(); }
      const policy = loadSanitizerPolicy({ repoRoot });
      const validate = (value, context = currentContext) => validateSanitizedRehearsalArtifact({ ...value, policy, now: generatedAt, ...context });
      expect(() => validate(artifact)).not.toThrow();
      expect(() => validate(artifact, legacyContext)).toThrow(/mismatch/);
      const hash = (value) => createHash("sha256").update(value).digest("hex");
      for (const mutate of [
        (a) => { a.manifest.sourceProfile.profile = "legacy-template-evolution-v1"; },
        (a) => { a.manifest.sourceProfile.sourceSchema = legacyContext.sourceSchema; },
        (a) => { a.manifest.sourceProfile.migrationRange = legacyContext.migrationRange; },
        (a) => { a.manifest.selection.coveredShapes = []; a.manifest.selection.requiredShapes = []; },
        (a) => { a.sql = a.sql.replace("sanitized-notes", "private notes"); },
        (a) => { a.sql = a.sql.replace("sanitized-owner-1", "sanitized-owner-private-customer"); },
        (a) => { a.sql += "UPDATE users SET password_hash='retained-secret';\n"; },
        (a) => { a.sql += "UPDATE templates SET description='retained customer content';\n"; },
        (a) => { a.sql += "UPDATE checklist_runs SET share_token='retained-token';\n"; },
      ]) {
        const changed = structuredClone(artifact); mutate(changed);
        changed.manifest.artifact = { sha256: hash(changed.sql), byteLength: Buffer.byteLength(changed.sql) };
        const { manifestIntegritySha256: _digest, ...unsigned } = changed.manifest;
        changed.manifest.manifestIntegritySha256 = hash(JSON.stringify(unsigned));
        expect(() => validate(changed)).toThrow();
      }
      expect(() => generate({ ...legacyContext, rawExport: exportRows(db) })).toThrow();
      expect(() => generate({ ...currentContext })).toThrow();
    } finally { db.close(); }
  });

  it("reports absent legacy edge cases honestly while retaining separate synthetic requirements", () => {
    const db = replayMigrations({ through: legacyContext.sourceSchema });
    try {
      addSourceLedgerTable(db);
      db.exec(rawExport);
      db.exec("UPDATE templates SET items='[]'; UPDATE checklist_runs SET items='[]'");
      const artifact = generate({ rawExport: exportRows(db) });
      expect(artifact.manifest.selection.observedSourceShapes).toEqual([]);
      expect(artifact.manifest.selection.requiredShapes).toEqual([]);
      expect(artifact.manifest.selection.absentSourceShapes).toContain("legacy-flat-items");
      expect(artifact.manifest.selection.syntheticEdgeCaseRequirements).toContain("legacy-flat-items");
    } finally { db.close(); }
  });

  it.each([false, true])("round-trips actual SQLite source/export/transformation/recovery (current=%s)", (current) => {
    const context = current ? currentContext : legacyContext;
    const source = syntheticSourceDatabase(repoRoot, current);
    const target = replayMigrations({ through: context.sourceSchema });
    const restore = replayMigrations();
    try {
      const artifact = generate({ ...context, rawExport: exportSyntheticRows(source) });
      const ledger = listMigrationFiles().map((file) => file.name);
      const capture = (db, applied) => sanitizedState({ templates: db.prepare("SELECT * FROM templates").all(), runs: db.prepare("SELECT * FROM checklist_runs").all(), ledger: applied, sourceSha256: artifact.manifest.artifact.sha256 });
      target.exec(artifact.sql);
      const before = capture(target, current ? ledger : ledger.slice(0, -1));
      if (!current) target.exec(readFileSync(path.join(repoRoot, "db/migrations", currentContext.sourceSchema), "utf8"));
      const after = capture(target, ledger);
      expect(verifySanitizedTransformation({ before, after, expectedLedger: ledger }).verdict).toBe("pass");
      if (current) expect(after.domainSha256).toBe(before.domainSha256);
      restore.exec(exportSyntheticRows(target));
      expect(validateSanitizedStateBinding(after, capture(restore, ledger))).toBe(true);
      restore.exec("UPDATE checklist_runs SET revision=revision+1");
      expect(() => validateSanitizedStateBinding(after, capture(restore, ledger))).toThrow(/domainSha256/);
    } finally { source.close(); target.close(); restore.close(); }
  });
});
