import { createRequire } from 'node:module';
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const MIGRATIONS_DIRECTORY = "db/migrations";
export const META_DIRECTORY = "db/migrations/meta";
export const PROVENANCE_FILE = "db/migration-provenance.json";
export const JOURNAL_FILE = "db/migrations/meta/_journal.json";

const TRUSTED_LEGACY_HEADER_SHA256 = "28bf4e0dd485e16d9ec2ae5d74ede9ff2f804e34485da54f310af2dc6537d32b";
const TRUSTED_LEGACY_ENTRIES_SHA256 = "1481cb93b761a1c4252ac7866d39dcfd72ada0515dedc92ed46555a9b6676ff5";
const TRUSTED_LEGACY_THROUGH = "0024_safe_template_evolution.sql";
const TRUSTED_LEGACY_COUNT = 24;
const APPROVED_METADATA_ONLY_SNAPSHOT_CORRECTION = Object.freeze({
  beforeCommit: 'e5a3aaa720e3621a13a23dc2fe028088ca042bb1',
  snapshot: '0024_snapshot.json',
  beforeSha256: '1a591c31f09b976eae3f1809082f4887d1317e77b502f8bc4fad53442b3e9170',
  afterSha256: 'd3947bb8300b6402942e36602c7794a1c48f5add09caf31e9a868bd08a875a04',
  creatingMigration: '0023_add_sitemap_revision_state.sql',
});
// Pinned independently of the candidate manifest and comparison branch. The
// snapshot hash is included in TRUSTED_LEGACY_ENTRIES_SHA256 above.
const TRUSTED_BOOTSTRAP_JOURNAL = {
  version: "7", dialect: "sqlite", entries: [{
    idx: 24, version: "6", when: 1788548742000,
    tag: "0024_safe_template_evolution", breakpoints: true,
  }],
};

const REQUIRED_GIT_LOCAL_ENV_VARS = [
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_CONFIG",
  "GIT_CONFIG_COUNT",
  "GIT_CONFIG_PARAMETERS",
  "GIT_DIR",
  "GIT_GRAFT_FILE",
  "GIT_IMPLICIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_INTERNAL_SUPER_PREFIX",
  "GIT_NO_REPLACE_OBJECTS",
  "GIT_OBJECT_DIRECTORY",
  "GIT_PREFIX",
  "GIT_REPLACE_REF_BASE",
  "GIT_SHALLOW_FILE",
  "GIT_SUPER_PREFIX",
  "GIT_WORK_TREE",
];

export function sanitizedGitEnvironment(source = process.env) {
  const environment = { ...source };
  for (const name of REQUIRED_GIT_LOCAL_ENV_VARS) delete environment[name];
  for (const name of Object.keys(environment)) {
    if (/^GIT_CONFIG_(?:KEY|VALUE)_\d+$/.test(name)) delete environment[name];
  }
  try {
    const discovered = execFileSync("git", ["rev-parse", "--local-env-vars"], {
      encoding: "utf8",
      env: environment,
      stdio: ["ignore", "pipe", "ignore"],
    });
    for (const name of discovered.split("\n").filter(Boolean)) delete environment[name];
  } catch {
    // The explicit fail-safe list above covers Git's documented repository-local variables.
  }
  return environment;
}

export function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

export function sha256File(file) {
  return sha256(readFileSync(file));
}

export function repositoryWorkspaceFingerprint(repoRoot) {
  const environment = sanitizedGitEnvironment();
  const gitBytes = (args) => execFileSync('git', args, {
    cwd: repoRoot, env: environment, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const fingerprint = createHash('sha256');
  fingerprint.update(gitBytes(['diff', '--binary', '--no-ext-diff', 'HEAD', '--']));
  fingerprint.update('\0untracked\0');
  const untracked = gitBytes(['ls-files', '--others', '--exclude-standard', '-z'])
    .toString('utf8').split('\0').filter(Boolean).sort();
  for (const relativePath of untracked) {
    const absolutePath = path.join(repoRoot, relativePath);
    const stat = lstatSync(absolutePath);
    fingerprint.update(relativePath);
    fingerprint.update(`\0${stat.mode}\0`);
    fingerprint.update(stat.isSymbolicLink() ? readlinkSync(absolutePath) : readFileSync(absolutePath));
    fingerprint.update('\0');
  }
  return fingerprint.digest('hex');
}

function jsonFile(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function listMigrationFiles(repoRoot) {
  return readdirSync(path.join(repoRoot, MIGRATIONS_DIRECTORY))
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

export function loadProvenanceState(repoRoot) {
  const provenance = jsonFile(path.join(repoRoot, PROVENANCE_FILE));
  const journal = jsonFile(path.join(repoRoot, JOURNAL_FILE));
  const files = listMigrationFiles(repoRoot);
  const snapshots = readdirSync(path.join(repoRoot, META_DIRECTORY))
    .filter((name) => /^\d{4}_snapshot\.json$/.test(name))
    .sort();
  return { repoRoot, provenance, journal, files, snapshots };
}

function failure(name, detail) {
  return { name, detail, verdict: "fail" };
}

function isApprovedMetadataSnapshotCorrection(repoRoot, entry, actualSnapshotHash) {
  if (entry.snapshot !== APPROVED_METADATA_ONLY_SNAPSHOT_CORRECTION.snapshot
      || entry.snapshotSha256 !== APPROVED_METADATA_ONLY_SNAPSHOT_CORRECTION.beforeSha256
      || actualSnapshotHash !== APPROVED_METADATA_ONLY_SNAPSHOT_CORRECTION.afterSha256) return false;
  try {
    const original = gitShow(repoRoot, APPROVED_METADATA_ONLY_SNAPSHOT_CORRECTION.beforeCommit, `${META_DIRECTORY}/${entry.snapshot}`);
    // Synthetic repositories used to prove migration generation may not carry
    // the project commit graph. Exact before/after hashes remain the trust root;
    // when the historical object is available, independently verify it too.
    return original === null || sha256(original) === APPROVED_METADATA_ONLY_SNAPSHOT_CORRECTION.beforeSha256;
  } catch {
    return false;
  }
}

export function validateProvenanceState(state) {
  const { repoRoot, provenance, journal, files, snapshots } = state;
  const failures = [];
  if (provenance.version !== 1) failures.push(failure("manifest-version", `Expected version 1, found ${provenance.version}.`));
  if (journal.version !== "7" || journal.dialect !== "sqlite") {
    failures.push(failure("journal-format", "Drizzle journal must be SQLite format version 7."));
  }

  const manifestFiles = provenance.migrations.map((entry) => entry.file);
  const malformedFiles = files.filter((name) => !/^\d{4}_[a-z][a-z0-9_]*\.sql$/.test(name));
  if (malformedFiles.length > 0) {
    failures.push(failure("migration-filename", `Malformed migration filenames: ${malformedFiles.join(",")}.`));
  }
  if (JSON.stringify(files) !== JSON.stringify(manifestFiles)) {
    failures.push(failure("migration-order", `Migration files differ from the locked manifest. actual=${files.join(",")} manifest=${manifestFiles.join(",")}`));
  }
  for (const entry of provenance.migrations) {
    const absolute = path.join(repoRoot, MIGRATIONS_DIRECTORY, entry.file);
    if (!existsSync(absolute)) continue;
    const actualHash = sha256File(absolute);
    if (actualHash !== entry.sha256) {
      failures.push(failure("migration-immutable", `${entry.file} has hash ${actualHash}; expected ${entry.sha256}.`));
    }
  }

  const baselineEntries = provenance.migrations.filter((entry) => entry.provenance === "legacy-baseline");
  if (sha256(JSON.stringify(provenance.baseline)) !== TRUSTED_LEGACY_HEADER_SHA256) {
    failures.push(failure("trusted-baseline-header", `Legacy baseline header is immutable at ${TRUSTED_LEGACY_COUNT} files through ${TRUSTED_LEGACY_THROUGH}.`));
  }
  if (
    baselineEntries.length !== TRUSTED_LEGACY_COUNT ||
    sha256(JSON.stringify(baselineEntries)) !== TRUSTED_LEGACY_ENTRIES_SHA256 ||
    provenance.migrations.slice(0, TRUSTED_LEGACY_COUNT).some((entry) => entry.provenance !== "legacy-baseline") ||
    provenance.migrations.slice(TRUSTED_LEGACY_COUNT).some((entry) => entry.provenance === "legacy-baseline")
  ) {
    failures.push(failure("trusted-legacy-baseline", `Only the exact ordered, hashed legacy history through ${TRUSTED_LEGACY_THROUGH} is trusted; later migrations require Drizzle provenance.`));
  }
  if (baselineEntries.length !== provenance.baseline.migrationCount) {
    failures.push(failure("baseline-count", `Baseline declares ${provenance.baseline.migrationCount} files but records ${baselineEntries.length}.`));
  }
  if (baselineEntries.at(-1)?.file !== provenance.baseline.through) {
    failures.push(failure("baseline-through", "Baseline terminal migration does not match the ordered manifest."));
  }

  const legacyNumbers = new Map();
  const generatedNumbers = new Set();
  for (const entry of provenance.migrations) {
    const number = Number(entry.file.slice(0, 4));
    if (entry.provenance === "legacy-baseline") {
      const names = legacyNumbers.get(number) ?? [];
      names.push(entry.file);
      legacyNumbers.set(number, names);
    } else {
      if (entry.provenance !== "drizzle-kit") failures.push(failure("unknown-provenance", `${entry.file} has unsupported provenance ${entry.provenance}.`));
      if (!entry.snapshot || !Number.isInteger(entry.journalIndex)) {
        failures.push(failure("generated-pairing", `${entry.file} lacks its Drizzle snapshot or journal index.`));
      }
      if (number <= 24) failures.push(failure("generated-sequence", `${entry.file} reuses the protected baseline range.`));
      if (generatedNumbers.has(number)) failures.push(failure("duplicate-sequence", `${entry.file} duplicates generated sequence ${number}.`));
      generatedNumbers.add(number);
    }
  }
  const allowedLegacyDuplicate = legacyNumbers.get(2) ?? [];
  for (const [number, names] of legacyNumbers) {
    if (names.length > 1 && !(number === 2 && JSON.stringify(names) === JSON.stringify([
      "0002_add_slug_to_templates.sql",
      "0002_add_username_and_profiles.sql",
    ]))) {
      failures.push(failure("duplicate-sequence", `Legacy sequence ${number} is duplicated by ${names.join(", ")}.`));
    }
  }
  if (allowedLegacyDuplicate.length !== 2) failures.push(failure("legacy-exception", "The exact historical 0002 duplicate is missing or changed."));

  const snapshotEntries = provenance.migrations.filter((entry) => entry.snapshot);
  const expectedSnapshots = snapshotEntries.map((entry) => entry.snapshot);
  if (JSON.stringify(snapshots) !== JSON.stringify(expectedSnapshots)) {
    failures.push(failure("snapshot-pairing", `Snapshot files differ from manifest. actual=${snapshots.join(",")} manifest=${expectedSnapshots.join(",")}`));
  }
  if (journal.entries.length !== snapshotEntries.length) {
    failures.push(failure("journal-pairing", `Journal has ${journal.entries.length} entries for ${snapshotEntries.length} provenance snapshots.`));
  }

  let previousSnapshotId = "00000000-0000-0000-0000-000000000000";
  snapshotEntries.forEach((entry, index) => {
    const snapshotPath = path.join(repoRoot, META_DIRECTORY, entry.snapshot);
    const expectedTag = entry.file.slice(0, -4);
    const expectedIndex = Number(entry.file.slice(0, 4));
    const journalEntry = journal.entries[index];
    if (!existsSync(snapshotPath)) return;
    const actualSnapshotHash = sha256File(snapshotPath);
    const approvedCorrection = isApprovedMetadataSnapshotCorrection(repoRoot, entry, actualSnapshotHash);
    if (actualSnapshotHash !== entry.snapshotSha256 && !approvedCorrection) {
      failures.push(failure("snapshot-immutable", `${entry.snapshot} has hash ${actualSnapshotHash}; expected ${entry.snapshotSha256}.`));
    }
    const snapshot = jsonFile(snapshotPath);
    if (snapshot.prevId !== previousSnapshotId) {
      failures.push(failure("snapshot-lineage", `${entry.snapshot} prevId ${snapshot.prevId} does not match ${previousSnapshotId}.`));
    }
    previousSnapshotId = snapshot.id;
    if (
      entry.snapshot !== `${String(expectedIndex).padStart(4, "0")}_snapshot.json` ||
      entry.journalIndex !== expectedIndex ||
      (index > 0 && expectedIndex !== snapshotEntries[index - 1].journalIndex + 1) ||
      !journalEntry ||
      journalEntry.idx !== entry.journalIndex ||
      journalEntry.tag !== expectedTag ||
      journalEntry.version !== "6"
    ) {
      failures.push(failure("journal-order", `${entry.file} is not paired with its expected journal entry.`));
    }
  });

  return failures;
}

export function verifySchemaMatchesLatestSnapshot(repoRoot) {
  const scratch = mkdtempSync(path.join(tmpdir(), "serplists-drizzle-check-"));
  try {
    const out = path.join(scratch, "migrations");
    cpSync(path.join(repoRoot, META_DIRECTORY), path.join(out, "meta"), { recursive: true });
    execFileSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", [
      "exec",
      "drizzle-kit",
      "generate",
      "--dialect",
      "sqlite",
      "--schema",
      path.join(repoRoot, "db/schema/index.ts"),
      "--out",
      path.relative(repoRoot, out),
      "--name",
      "provenance_check",
    ], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const unexpected = readdirSync(out).filter((name) => name.endsWith(".sql"));
    return unexpected.length === 0
      ? []
      : [failure("schema-snapshot-drift", `Drizzle generated ${unexpected.join(", ")}; run pnpm db:generate -- --name <name>.`)];
  } catch (error) {
    const detail = error?.stderr?.toString().trim() || error.message;
    return [failure("schema-snapshot-check", detail)];
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function gitShow(repoRoot, ref, relativePath) {
  try {
    return execFileSync("git", ["show", `${ref}:${relativePath}`], {
      cwd: repoRoot,
      encoding: "utf8",
      env: sanitizedGitEnvironment(),
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

function comparisonRoot(state, baseRef) {
  if (baseRef) {
    // A missing object is not the same as an existing pre-provenance commit.
    execFileSync("git", ["rev-parse", "--verify", `${baseRef}^{commit}`], {
      cwd: state.repoRoot, env: sanitizedGitEnvironment(), stdio: "pipe",
    });
    const baseText = gitShow(state.repoRoot, baseRef, PROVENANCE_FILE);
    if (baseText !== null) return {
      provenance: JSON.parse(baseText),
      read: (file) => gitShow(state.repoRoot, baseRef, file),
    };
  }
  const migrations = state.provenance.migrations.slice(0, TRUSTED_LEGACY_COUNT);
  if (sha256(JSON.stringify(state.provenance.baseline)) !== TRUSTED_LEGACY_HEADER_SHA256 ||
      sha256(JSON.stringify(migrations)) !== TRUSTED_LEGACY_ENTRIES_SHA256) {
    throw new Error("The independently pinned bootstrap migration root is invalid.");
  }
  const snapshots = new Map();
  for (const entry of migrations.filter((item) => item.snapshot)) {
    const file = `${META_DIRECTORY}/${entry.snapshot}`;
    const content = readFileSync(path.join(state.repoRoot, file), "utf8");
    const actualHash = sha256(content);
    const approvedCorrection = isApprovedMetadataSnapshotCorrection(state.repoRoot, entry, actualHash);
    if (actualHash !== entry.snapshotSha256 && !approvedCorrection) {
      throw new Error(`Pinned bootstrap snapshot ${entry.snapshot} has changed.`);
    }
    snapshots.set(file, content);
  }
  return {
    provenance: { baseline: state.provenance.baseline, migrations },
    read: (file) => file === JOURNAL_FILE
      ? JSON.stringify(TRUSTED_BOOTSTRAP_JOURNAL) : snapshots.get(file) ?? null,
  };
}

export function validateAgainstBase(state, baseRef) {
  let root;
  try { root = comparisonRoot(state, baseRef); }
  catch (error) { return [failure("comparison-root", error.message)]; }
  const base = root.provenance;
  const failures = [];
  const currentByFile = new Map(state.provenance.migrations.map((entry) => [entry.file, entry]));
  for (const [index, baseEntry] of base.migrations.entries()) {
    const current = currentByFile.get(baseEntry.file);
    if (!current) {
      failures.push(failure("base-history-deleted", `${baseEntry.file} exists at ${baseRef} and cannot be removed.`));
      continue;
    }
    if (state.provenance.migrations[index]?.file !== baseEntry.file || JSON.stringify(current) !== JSON.stringify(baseEntry)) {
      failures.push(failure("base-history-modified", `${baseEntry.file} provenance differs from immutable base ${baseRef}.`));
    }
  }
  if (JSON.stringify(state.provenance.baseline) !== JSON.stringify(base.baseline)) {
    failures.push(failure("base-history-modified", `Legacy baseline metadata differs from immutable base ${baseRef}.`));
  }
  const baseJournalText = root.read(JOURNAL_FILE);
  if (baseJournalText !== null) {
    const baseJournal = JSON.parse(baseJournalText);
    const currentPrefix = state.journal.entries.slice(0, baseJournal.entries.length);
    if (JSON.stringify(currentPrefix) !== JSON.stringify(baseJournal.entries)) {
      failures.push(failure("base-history-modified", `Historical Drizzle journal entries differ from immutable base ${baseRef}.`));
    }
  }
  return failures;
}

export async function verifyNewMigrationGeneratedFromBase(state, baseRef) {
  let root;
  try { root = comparisonRoot(state, baseRef); }
  catch (error) { return [failure('generated-reproduction', error.message)]; }
  const added = state.provenance.migrations.slice(root.provenance.migrations.length);
  if (!added.length) return [];
  let candidate;
  try {
    const require = createRequire(import.meta.url);
    const apiPath = require.resolve('drizzle-kit/api');
    if (jsonFile(path.join(path.dirname(apiPath), 'package.json')).version !== '0.31.8') throw new Error('Reproduction requires pinned Drizzle Kit 0.31.8.');
    const { generateSQLiteMigration } = require('drizzle-kit/api');
    const priorEntry = root.provenance.migrations.filter(entry => entry.snapshot).at(-1);
    const priorText = priorEntry && root.read(`${META_DIRECTORY}/${priorEntry.snapshot}`);
    if (!priorText) throw new Error('Comparison base snapshot is unavailable.');
    let previous = JSON.parse(priorText);
    for (candidate of added) {
      if (!candidate.snapshot) throw new Error(`${candidate.file} lacks a snapshot.`);
      const current = jsonFile(path.join(state.repoRoot, META_DIRECTORY, candidate.snapshot));
      if (current.prevId !== previous.id) throw new Error(`${candidate.snapshot} has invalid snapshot ancestry.`);
      const statements = await generateSQLiteMigration(previous, current);
      const journal = state.journal.entries.find(entry => entry.idx === candidate.journalIndex);
      if (!journal || !statements.length) throw new Error(`${candidate.file} has no reproducible generated transition.`);
      // This is Drizzle Kit 0.31.8 writeResult's exact formatting. No semantic
      // SQL equivalence or whitespace normalization may conceal manual edits.
      const expected = statements.join(journal.breakpoints ? '--> statement-breakpoint\n' : '\n');
      if (expected !== readFileSync(path.join(state.repoRoot, MIGRATIONS_DIRECTORY, candidate.file), 'utf8')) {
        return [failure('generated-sql-modified', `${candidate.file} differs from the pinned public snapshot-diff API output.`)];
      }
      previous = current;
    }
    return [];
  } catch (error) {
    return [failure('generated-reproduction', `${candidate?.file ?? 'release range'}: ${error.message}`)];
  }
}

export function appendGeneratedProvenance(repoRoot, { migrationFile, snapshotFile }) {
  const provenancePath = path.join(repoRoot, PROVENANCE_FILE);
  const provenance = jsonFile(provenancePath);
  const journal = jsonFile(path.join(repoRoot, JOURNAL_FILE));
  const journalEntry = journal.entries.at(-1);
  provenance.migrations.push({
    file: migrationFile,
    sha256: sha256File(path.join(repoRoot, MIGRATIONS_DIRECTORY, migrationFile)),
    provenance: "drizzle-kit",
    snapshot: snapshotFile,
    snapshotSha256: sha256File(path.join(repoRoot, META_DIRECTORY, snapshotFile)),
    journalIndex: journalEntry.idx,
  });
  writeFileSync(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
}

export function allPassingChecks(failures) {
  const checks = [
    { name: "migration-order", failureNames: ["migration-order"] },
    { name: "migration-immutable", failureNames: ["migration-immutable"] },
    { name: "duplicate-sequence", failureNames: ["duplicate-sequence"] },
    { name: "snapshot-pairing", failureNames: ["snapshot-pairing"] },
    { name: "snapshot-lineage", failureNames: ["snapshot-lineage"] },
    { name: "journal-pairing", failureNames: ["journal-pairing"] },
    { name: "schema-snapshot-drift", failureNames: ["schema-snapshot-drift"] },
    { name: "base-history-immutable", failureNames: ["base-history-immutable", "base-history-modified", "base-history-deleted", "comparison-root"] },
    { name: "generated-reproduction", failureNames: ["generated-reproduction", "generated-sql-modified", "generated-snapshot-modified"] },
  ];
  return checks.map(({ name, failureNames }) => ({
    name,
    verdict: failures.some((item) => failureNames.includes(item.name)) ? "fail" : "pass",
  }));
}
