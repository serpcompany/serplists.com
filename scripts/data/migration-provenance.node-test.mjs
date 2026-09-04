import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  loadProvenanceState,
  sanitizedGitEnvironment,
  sha256File,
  validateAgainstBase,
  validateProvenanceState,
  verifySchemaMatchesLatestSnapshot,
} from "./migration-provenance-lib.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../..");

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
  }).trim();
}

test("the checked-in legacy baseline is internally valid", () => {
  assert.deepEqual(validateProvenanceState(loadProvenanceState(repoRoot)), []);
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
