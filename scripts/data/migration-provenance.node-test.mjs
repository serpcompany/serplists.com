import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import "./migration-provenance-bootstrap.node-test.mjs";

import {
  allPassingChecks,
  loadProvenanceState,
  repositoryWorkspaceFingerprint,
  sanitizedGitEnvironment,
  sha256File,
  validateAgainstBase,
  validateProvenanceState,
  verifySchemaMatchesLatestSnapshot,
  verifyNewMigrationGeneratedFromBase,
} from "./migration-provenance-lib.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../..");

test('repository workspace fingerprints detect byte changes behind unchanged dirty status', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'migration-workspace-fingerprint-'));
  try {
    runGit(root, ['init', '-q']);
    runGit(root, ['config', 'user.email', 'test@example.invalid']);
    runGit(root, ['config', 'user.name', 'Migration Test']);
    writeFileSync(path.join(root, 'tracked.txt'), 'baseline\n');
    runGit(root, ['add', 'tracked.txt']);
    runGit(root, ['commit', '-qm', 'baseline']);
    writeFileSync(path.join(root, 'tracked.txt'), 'dirty version one\n');
    const first = repositoryWorkspaceFingerprint(root);
    writeFileSync(path.join(root, 'tracked.txt'), 'dirty version two\n');
    assert.notEqual(repositoryWorkspaceFingerprint(root), first);
    writeFileSync(path.join(root, 'untracked.txt'), 'untracked one\n');
    const second = repositoryWorkspaceFingerprint(root);
    writeFileSync(path.join(root, 'untracked.txt'), 'untracked two\n');
    assert.notEqual(repositoryWorkspaceFingerprint(root), second);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "migration-provenance-test-"));
  cpSync(path.join(repoRoot, "db"), path.join(root, "db"), { recursive: true });
  return root;
}

function errors(root) {
  return validateProvenanceState(loadProvenanceState(root)).map((item) => item.name);
}

function editManifest(root, mutate) {
  const file = path.join(root, "db/migration-provenance.json");
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  mutate(manifest);
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

function runGit(cwd, args, sourceEnvironment = process.env) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: sanitizedGitEnvironment(sourceEnvironment),
  }).trimEnd();
}

test("the checked-in legacy baseline is internally valid", () => {
  assert.deepEqual(validateProvenanceState(loadProvenanceState(repoRoot)), []);
});

test('the approved snapshot correction fails closed without its pinned historical object', () => {
  const root = fixture();
  try {
    assert.ok(errors(root).includes('snapshot-immutable'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("unchanged Drizzle schema produces no migration from the baseline", () => {
  assert.deepEqual(verifySchemaMatchesLatestSnapshot(repoRoot), []);
});

test("a handwritten metadata-less migration fails", () => {
  const root = fixture();
  try {
    writeFileSync(path.join(root, "db/migrations/0025_handwritten.sql"), "ALTER TABLE users ADD COLUMN unsafe TEXT;\n");
    assert.ok(errors(root).includes("migration-order"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a no-op cannot extend the legacy baseline when the comparison base has no manifest", () => {
  const root = fixture();
  try {
    runGit(root, ["init", "-q"]);
    runGit(root, ["config", "user.email", "test@example.invalid"]);
    runGit(root, ["config", "user.name", "Migration Test"]);
    rmSync(path.join(root, "db/migration-provenance.json"));
    rmSync(path.join(root, "db/migrations/meta"), { recursive: true, force: true });
    runGit(root, ["add", "db"]);
    runGit(root, ["commit", "-qm", "pre-provenance base"]);
    const base = runGit(root, ["rev-parse", "HEAD"]);

    cpSync(path.join(repoRoot, "db/migration-provenance.json"), path.join(root, "db/migration-provenance.json"));
    cpSync(path.join(repoRoot, "db/migrations/meta"), path.join(root, "db/migrations/meta"), { recursive: true });
    const sql = path.join(root, "db/migrations/0025_handwritten_noop.sql");
    writeFileSync(sql, "SELECT 1;\n");
    editManifest(root, (manifest) => {
      manifest.baseline.migrationCount = 25;
      manifest.baseline.through = "0025_handwritten_noop.sql";
      manifest.migrations.push({
        file: "0025_handwritten_noop.sql",
        sha256: sha256File(sql),
        provenance: "legacy-baseline",
      });
    });

    const state = loadProvenanceState(root);
    assert.ok(validateAgainstBase(state, base).some((item) => item.name === "comparison-root"));
    const names = validateProvenanceState(state).map((item) => item.name);
    assert.ok(names.includes("trusted-baseline-header"));
    assert.ok(names.includes("trusted-legacy-baseline"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("renumbering a trusted legacy migration cannot redefine the boundary", () => {
  const root = fixture();
  try {
    renameSync(
      path.join(root, "db/migrations/0024_safe_template_evolution.sql"),
      path.join(root, "db/migrations/0025_safe_template_evolution.sql"),
    );
    editManifest(root, (manifest) => {
      manifest.baseline.through = "0025_safe_template_evolution.sql";
      manifest.migrations.at(-1).file = "0025_safe_template_evolution.sql";
    });
    const names = errors(root);
    assert.ok(names.includes("trusted-baseline-header"));
    assert.ok(names.includes("trusted-legacy-baseline"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an extra schema-changing migration cannot be labeled as legacy", () => {
  const root = fixture();
  try {
    const sql = path.join(root, "db/migrations/0025_extra_legacy.sql");
    writeFileSync(sql, "ALTER TABLE users ADD COLUMN untrusted TEXT;\n");
    editManifest(root, (manifest) => {
      manifest.baseline.migrationCount = 25;
      manifest.baseline.through = "0025_extra_legacy.sql";
      manifest.migrations.push({
        file: "0025_extra_legacy.sql",
        sha256: sha256File(sql),
        provenance: "legacy-baseline",
      });
    });
    const names = errors(root);
    assert.ok(names.includes("trusted-baseline-header"));
    assert.ok(names.includes("trusted-legacy-baseline"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a malformed numbered SQL file cannot evade enumeration", () => {
  const root = fixture();
  try {
    writeFileSync(path.join(root, "db/migrations/25 Handwritten.sql"), "SELECT 1;\n");
    assert.ok(errors(root).includes("migration-filename"));
    assert.ok(errors(root).includes("migration-order"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a modified historical migration fails even if SQL remains valid", () => {
  const root = fixture();
  try {
    const file = path.join(root, "db/migrations/0024_safe_template_evolution.sql");
    writeFileSync(file, `${readFileSync(file, "utf8")}\n-- seemingly harmless edit\n`);
    assert.ok(errors(root).includes("migration-immutable"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a manifest entry without Drizzle snapshot/journal provenance fails", () => {
  const root = fixture();
  try {
    const sql = path.join(root, "db/migrations/0025_unpaired.sql");
    writeFileSync(sql, "ALTER TABLE users ADD COLUMN unsafe TEXT;\n");
    editManifest(root, (manifest) => manifest.migrations.push({
      file: "0025_unpaired.sql",
      sha256: sha256File(sql),
      provenance: "drizzle-kit",
    }));
    assert.ok(errors(root).includes("generated-pairing"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("duplicate post-baseline sequence numbers fail", () => {
  const root = fixture();
  try {
    for (const name of ["0025_first.sql", "0025_second.sql"]) {
      const sql = path.join(root, "db/migrations", name);
      writeFileSync(sql, "SELECT 1;\n");
      editManifest(root, (manifest) => manifest.migrations.push({
        file: name,
        sha256: sha256File(sql),
        provenance: "drizzle-kit",
      }));
    }
    assert.ok(errors(root).includes("duplicate-sequence"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an unpaired or renamed snapshot fails", () => {
  const root = fixture();
  try {
    cpSync(
      path.join(root, "db/migrations/meta/0024_snapshot.json"),
      path.join(root, "db/migrations/meta/0025_snapshot.json"),
    );
    assert.ok(errors(root).includes("snapshot-pairing"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("journal additions without manifest pairing fail", () => {
  const root = fixture();
  try {
    const journalFile = path.join(root, "db/migrations/meta/_journal.json");
    const journal = JSON.parse(readFileSync(journalFile, "utf8"));
    journal.entries.push({ idx: 25, version: "6", when: 1, tag: "0025_handwritten", breakpoints: true });
    writeFileSync(journalFile, `${JSON.stringify(journal, null, 2)}\n`);
    assert.ok(errors(root).includes("journal-pairing"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("base history cannot be rewritten by updating the candidate manifest hash", () => {
  const root = fixture();
  try {
    runGit(root, ["init", "-q"]);
    runGit(root, ["config", "user.email", "test@example.invalid"]);
    runGit(root, ["config", "user.name", "Migration Test"]);
    runGit(root, ["add", "db"]);
    runGit(root, ["commit", "-qm", "baseline"]);
    const sql = path.join(root, "db/migrations/0024_safe_template_evolution.sql");
    writeFileSync(sql, `${readFileSync(sql, "utf8")}\n-- rewrite\n`);
    editManifest(root, (manifest) => {
      manifest.migrations.at(-1).sha256 = sha256File(sql);
    });
    const failures = validateAgainstBase(loadProvenanceState(root), "HEAD");
    assert.ok(failures.some((item) => item.name === "base-history-modified"));
    assert.deepEqual(
      allPassingChecks(failures).find((item) => item.name === "base-history-immutable"),
      { name: "base-history-immutable", verdict: "fail" },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fixture Git commands ignore hook-inherited parent repository pointers", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "migration-provenance-parent-"));
  const child = fixture();
  try {
    runGit(parent, ["init", "-q"]);
    runGit(parent, ["config", "user.email", "parent@example.invalid"]);
    runGit(parent, ["config", "user.name", "Parent Identity"]);
    runGit(parent, ["config", "core.bare", "false"]);
    const poisoned = {
      ...process.env,
      GIT_DIR: path.join(parent, ".git"),
      GIT_WORK_TREE: parent,
      GIT_INDEX_FILE: path.join(parent, ".git", "index"),
    };

    runGit(child, ["init", "-q"], poisoned);
    runGit(child, ["config", "user.email", "child@example.invalid"], poisoned);
    runGit(child, ["config", "user.name", "Migration Test"], poisoned);
    runGit(child, ["add", "db"], poisoned);
    runGit(child, ["commit", "-qm", "child baseline"], poisoned);

    assert.equal(runGit(parent, ["config", "user.name"]), "Parent Identity");
    assert.equal(runGit(parent, ["config", "core.bare"]), "false");
    assert.equal(runGit(child, ["config", "user.name"]), "Migration Test");
    assert.notEqual(runGit(child, ["rev-parse", "--git-dir"]), path.join(parent, ".git"));
  } finally {
    rmSync(parent, { recursive: true, force: true });
    rmSync(child, { recursive: true, force: true });
  }
});

test("a fresh clone generates and stages the complete next Drizzle provenance set", () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), "migration-provenance-clean-clone-"));
  const parent = path.join(sandbox, "parent");
  const clone = path.join(sandbox, "clone");
  try {
    runGit(sandbox, ["init", "-q", parent]);
    runGit(parent, ["config", "user.email", "parent@example.invalid"]);
    runGit(parent, ["config", "user.name", "Untouched Parent"]);
    runGit(parent, ["config", "core.bare", "false"]);
    runGit(sandbox, ["clone", "--quiet", "--no-local", repoRoot, clone]);
    runGit(clone, ["config", "user.email", "test@example.invalid"]);
    runGit(clone, ["config", "user.name", "Migration Test"]);
    symlinkSync(path.join(repoRoot, "node_modules"), path.join(clone, "node_modules"), "dir");
    const base = runGit(clone, ["rev-parse", "HEAD"]);
    const poisoned = {
      ...process.env,
      GIT_DIR: path.join(parent, ".git"),
      GIT_WORK_TREE: parent,
      GIT_INDEX_FILE: path.join(parent, ".git", "index"),
    };

    const schemaFile = path.join(clone, "db/schema/users.ts");
    const originalSchema = readFileSync(schemaFile, "utf8");
    assert.match(originalSchema, /  updated_at: text\("updated_at"\),\n}\);/);
    writeFileSync(schemaFile, originalSchema.replace(
      "  updated_at: text(\"updated_at\"),\n});",
      "  updated_at: text(\"updated_at\"),\n  provenance_acceptance_probe: text(\"provenance_acceptance_probe\"),\n});",
    ));

    const generated = spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", [
      "run",
      "db:generate",
      "--",
      "--name",
      "add_provenance_acceptance_probe",
      "--report-dir",
      "tmp/data-reports/fresh-clone",
    ], { cwd: clone, encoding: "utf8", env: poisoned });
    assert.equal(generated.status, 0, `${generated.stdout}\n${generated.stderr}`);

    const sqlName = "0025_add_provenance_acceptance_probe.sql";
    const snapshotName = "0025_snapshot.json";
    assert.equal(readFileSync(path.join(clone, "db/migrations", sqlName), "utf8"), "ALTER TABLE `users` ADD `provenance_acceptance_probe` text;");
    const journal = JSON.parse(readFileSync(path.join(clone, "db/migrations/meta/_journal.json"), "utf8"));
    assert.deepEqual(journal.entries.at(-1), {
      idx: 25,
      version: "6",
      when: journal.entries.at(-1).when,
      tag: "0025_add_provenance_acceptance_probe",
      breakpoints: true,
    });
    const manifest = JSON.parse(readFileSync(path.join(clone, "db/migration-provenance.json"), "utf8"));
    assert.deepEqual(manifest.migrations.at(-1), {
      file: sqlName,
      sha256: sha256File(path.join(clone, "db/migrations", sqlName)),
      provenance: "drizzle-kit",
      snapshot: snapshotName,
      snapshotSha256: sha256File(path.join(clone, "db/migrations/meta", snapshotName)),
      journalIndex: 25,
    });

    const provenance = spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", [
      "run",
      "check:data:migration-provenance",
      "--",
      "--base",
      "HEAD",
      "--report-dir",
      "tmp/data-reports/fresh-clone",
    ], { cwd: clone, encoding: "utf8", env: poisoned });
    assert.equal(provenance.status, 0, `${provenance.stdout}\n${provenance.stderr}`);
    assert.deepEqual(runGit(clone, ["status", "--short"], poisoned).split("\n").filter(Boolean).sort(), [
      " M db/migration-provenance.json",
      " M db/migrations/meta/_journal.json",
      " M db/schema/users.ts",
      `?? db/migrations/${sqlName}`,
      `?? db/migrations/meta/${snapshotName}`,
    ].sort());

    runGit(clone, ["add", "db"], poisoned);
    runGit(clone, ["commit", "-qm", "generated migration"], poisoned);
    const head = runGit(clone, ["rev-parse", "HEAD"], poisoned);
    assert.equal(runGit(clone, ["status", "--short"], poisoned), "");

    const realPnpm = execFileSync("which", [process.platform === "win32" ? "pnpm.cmd" : "pnpm"], { encoding: "utf8" }).trim();
    cpSync(path.join(repoRoot, "scripts/data/check-staging-reviewed-range.mjs"), path.join(clone, "scripts/data/check-staging-reviewed-range-under-test.mjs"));
    const stub = path.join(parent, "pnpm");
    writeFileSync(stub, [
      "#!/bin/sh",
      'if [ "$1" = "exec" ] && [ "$2" = "wrangler" ] && [ "$4" = "info" ]; then',
      "  printf '%s\\n' '[{\"name\":\"serp-checklists-staging-db\",\"uuid\":\"fcaf4325-5be7-4ead-ab60-45932a04177b\"}]'",
      "  exit 0",
      "fi",
      'if [ "$1" = "exec" ] && [ "$2" = "wrangler" ]; then',
      "  printf 'Migrations to be applied:\\n┌────┐\\n│ %s │\\n└────┘\\n' \"$FAKE_PENDING_MIGRATION\"",
      "  exit 0",
      "fi",
      'exec "$REAL_PNPM" "$@"',
      "",
    ].join("\n"));
    chmodSync(stub, 0o755);
    const stagingEnvironment = {
      ...poisoned,
      PATH: `${parent}:${process.env.PATH}`,
      REAL_PNPM: realPnpm,
      FAKE_PENDING_MIGRATION: sqlName,
      STAGING_BASE_SHA: base,
      GITHUB_SHA: head,
    };
    const staging = spawnSync(process.execPath, ["scripts/data/check-staging-reviewed-range-under-test.mjs"], {
      cwd: clone,
      encoding: "utf8",
      env: stagingEnvironment,
    });
    // Genuine generation proves provenance, not reviewed domain coverage. This
    // users-table probe has no supported rehearsal profile and must stay blocked.
    assert.equal(staging.status, 1, `${staging.stdout}\n${staging.stderr}`);
    const stagingReport = () => JSON.parse(readFileSync(path.join(clone, 'tmp/data-reports/staging/staging-reviewed-range.json'), 'utf8'));
    assert.equal(stagingReport().failedStage, 'staging-range-plan');
    assert.equal(stagingReport().code, 'CANARY_SUBPROCESS_FAILED');
    assert.equal(stagingReport().exitStatus, 1);
    // Check the private resolver's actual cause separately. The public producer
    // must retain the safe stage/code, not leak its child's diagnostic text.
    const uncoveredPlan = spawnSync(process.execPath, ['--input-type=module', '-e',
      'import { resolvePendingRehearsalPlan } from "./scripts/data/rehearsal-plan-lib.mjs"; resolvePendingRehearsalPlan({repoRoot:process.cwd(),commit:process.argv[1],baseRef:process.argv[2],pending:[process.argv[3]]});',
      head, base, sqlName], { cwd: clone, encoding: 'utf8', env: sanitizedGitEnvironment(poisoned) });
    assert.equal(uncoveredPlan.status, 1);
    assert.match(`${uncoveredPlan.stdout}\n${uncoveredPlan.stderr}`, /no rehearsal plan/);

    rmSync(path.join(clone, "db/migrations/meta", snapshotName));
    const missingMetadata = spawnSync(process.execPath, ["scripts/data/check-staging-reviewed-range-under-test.mjs"], {
      cwd: clone,
      encoding: "utf8",
      env: stagingEnvironment,
    });
    assert.equal(missingMetadata.status, 1);
    assert.equal(stagingReport().failedStage, 'staging-range-provenance');
    assert.equal(stagingReport().code, 'CANARY_SUBPROCESS_FAILED');
    assert.equal(stagingReport().exitStatus, 1);
    assert.equal(runGit(parent, ["config", "user.name"]), "Untouched Parent");
    assert.equal(runGit(parent, ["config", "core.bare"]), "false");
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
  assert.equal(existsSync(sandbox), false);
});


test('two independently generated migration commits form a valid release range with immutable adjacent transitions', async () => {
  const root = fixture();
  try {
    cpSync(path.join(repoRoot, 'scripts/data'), path.join(root, 'scripts/data'), { recursive: true });
    cpSync(path.join(repoRoot, 'package.json'), path.join(root, 'package.json'));
    symlinkSync(path.join(repoRoot, 'node_modules'), path.join(root, 'node_modules'), 'dir');
    writeFileSync(path.join(root, '.gitignore'), 'node_modules\ntmp\n');
    runGit(root, ['init', '-q', '-b', 'staging']);
    runGit(root, ['fetch', '-q', repoRoot, 'e5a3aaa720e3621a13a23dc2fe028088ca042bb1']);
    runGit(root, ['config', 'user.name', 'Migration Test']);
    runGit(root, ['config', 'user.email', 'test@example.invalid']);
    runGit(root, ['add', '.']);
    runGit(root, ['commit', '-qm', 'baseline']);
    const base = runGit(root, ['rev-parse', 'HEAD']);
    assert.deepEqual(await verifyNewMigrationGeneratedFromBase(loadProvenanceState(root), base), []);
    for (const number of [1, 2]) {
      const schemaFile = path.join(root, 'db/schema/users.ts');
      writeFileSync(schemaFile, readFileSync(schemaFile, 'utf8').replace('  updated_at: text("updated_at"),', `  release_probe_${number}: text("release_probe_${number}"),\n  updated_at: text("updated_at"),`));
      const result = spawnSync(process.execPath, ['scripts/data/generate-drizzle-migration.mjs', '--name', `add_release_probe_${number}`], { cwd: root, env: sanitizedGitEnvironment(), encoding: 'utf8' });
      assert.equal(result.status, 0, result.stdout + result.stderr);
      runGit(root, ['add', 'db']);
      runGit(root, ['commit', '-qm', `generated migration ${number}`]);
      const state = loadProvenanceState(root);
      assert.deepEqual(validateProvenanceState(state), []);
      assert.deepEqual(validateAgainstBase(state, base), []);
      assert.deepEqual(await verifyNewMigrationGeneratedFromBase(state, base), []);
      assert.deepEqual(verifySchemaMatchesLatestSnapshot(root), []);
    }
    const release = loadProvenanceState(root);
    assert.equal(release.provenance.migrations.length, 26);
    for (const candidate of release.provenance.migrations.slice(-2)) {
      const sql = path.join(root, 'db/migrations', candidate.file);
      writeFileSync(sql, readFileSync(sql, 'utf8') + '\n-- manual alteration');
      assert.ok(validateProvenanceState(loadProvenanceState(root)).some(result => result.name === 'migration-immutable'));
      editManifest(root, manifest => { manifest.migrations.find(entry => entry.file === candidate.file).sha256 = sha256File(sql); });
      assert.deepEqual(validateProvenanceState(loadProvenanceState(root)), []);
      assert.ok((await verifyNewMigrationGeneratedFromBase(loadProvenanceState(root), base)).some(result => result.name === 'generated-sql-modified'));
      runGit(root, ['checkout', '--', 'db']);
    }
    const journalFile = path.join(root, 'db/migrations/meta/_journal.json');
    const journal = JSON.parse(readFileSync(journalFile, 'utf8'));
    [journal.entries[1], journal.entries[2]] = [journal.entries[2], journal.entries[1]];
    writeFileSync(journalFile, JSON.stringify(journal));
    assert.ok(errors(root).includes('journal-order'));
    runGit(root, ['checkout', '--', 'db']);
    rmSync(path.join(root, 'db/migrations/meta/0025_snapshot.json'));
    assert.ok(errors(root).includes('snapshot-pairing'));
    runGit(root, ['checkout', '--', 'db']);
    const snapshotFile = path.join(root, 'db/migrations/meta/0026_snapshot.json');
    const snapshot = JSON.parse(readFileSync(snapshotFile, 'utf8'));
    snapshot.prevId = JSON.parse(readFileSync(path.join(root, 'db/migrations/meta/0024_snapshot.json'), 'utf8')).id;
    writeFileSync(snapshotFile, JSON.stringify(snapshot));
    editManifest(root, manifest => { manifest.migrations.at(-1).snapshotSha256 = sha256File(snapshotFile); });
    assert.ok(errors(root).includes('snapshot-lineage'));
    assert.ok((await verifyNewMigrationGeneratedFromBase(loadProvenanceState(root), base)).length > 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
