import { fileURLToPath } from "node:url";
import { createHmac } from "node:crypto";

const MIGRATION_PATTERN = /^\d{4}_[a-z0-9_]+\.sql$/;
const BASELINE_FILE = fileURLToPath(new URL("./sql/capture-invariants.sql", import.meta.url));
const EVOLUTION_FILE = fileURLToPath(
  new URL("./sql/capture-invariants-0024.sql", import.meta.url),
);

export function parseAppliedMigrationLedger(output, { allowEmpty = false } = {}) {
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error("Applied migration ledger output was not valid JSON.");
  }
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  if (entries.length !== 1 || !Array.isArray(entries[0]?.results)) {
    throw new Error("Applied migration ledger must contain exactly one complete result set.");
  }
  const rows = entries[0].results;
  const names = rows.map((row) => row?.name);
  if (names.length === 0) {
    if (allowEmpty) return [];
    throw new Error("Applied migration ledger did not contain recognized migration names.");
  }
  if (names.some((name) => typeof name !== "string" || !MIGRATION_PATTERN.test(name))) {
    throw new Error("Applied migration ledger contains a malformed migration identity.");
  }
  const ids = rows.map((row) => row?.id);
  if (ids.some((id) => !Number.isInteger(id) || id < 1) || new Set(ids).size !== ids.length || ids.some((id, index) => index > 0 && id <= ids[index - 1])) {
    throw new Error("Applied migration ledger contains malformed or noncanonical application sequence IDs.");
  }
  if (new Set(names).size !== names.length) {
    throw new Error("Applied migration ledger contains duplicate migration identities.");
  }
  const sorted = [...names].sort((left, right) => left.localeCompare(right, "en"));
  if (names.some((name, index) => name !== sorted[index])) {
    throw new Error("Applied migration ledger is not in canonical migration order.");
  }
  return names;
}

export function compareMigrationLedger({ repositoryMigrations, appliedMigrations }) {
  const missing = repositoryMigrations.filter((name) => !appliedMigrations.includes(name));
  const unexpected = appliedMigrations.filter((name) => !repositoryMigrations.includes(name));
  const orderMatches = JSON.stringify(repositoryMigrations) === JSON.stringify(appliedMigrations);
  return {
    expected: repositoryMigrations,
    applied: appliedMigrations,
    appliedThrough: appliedMigrations.at(-1) ?? null,
    missing,
    unexpected,
    orderMatches,
    verdict: missing.length || unexpected.length || !orderMatches ? "fail" : "pass",
  };
}

export function selectInvariantSqlFiles({ appliedMigrations }) {
  const files = [
    { minimumMigration: "0001_initial_schema.sql", path: BASELINE_FILE },
  ];
  if (appliedMigrations.includes("0024_safe_template_evolution.sql")) {
    files.push({
      minimumMigration: "0024_safe_template_evolution.sql",
      path: EVOLUTION_FILE,
    });
  }
  return files;
}

export function parseInvariantOutput(output) {
  const parsed = JSON.parse(output);
  const rows = (Array.isArray(parsed) ? parsed : [parsed]).flatMap((entry) => entry?.results ?? []);
  const values = Object.fromEntries(rows.filter((row) => typeof row?.invariant === "string").map((row) => [row.invariant, Number(row.total_rows)]));
  if (!Object.keys(values).length || Object.values(values).some((value) => !Number.isFinite(value))) throw new Error("Remote invariant output is missing or malformed.");
  return values;
}

export function privacySafeOwnershipDigest({ rows, key }) {
  if ((key ?? "").length < 32 || !Array.isArray(rows)) throw new Error("Ownership digest requires protected key and rows.");
  const canonical = rows.map((row) => [String(row.kind), String(row.id), String(row.user_id), String(row.deleted_state)].join("\u001f")).sort().join("\n");
  return createHmac("sha256", key).update(canonical).digest("hex");
}

function hmac(value, key) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((name) => [name, canonicalJson(value[name])]));
  }
  return value;
}

function normalizedItems(raw) {
  let value;
  try {
    value = JSON.parse(String(raw));
  } catch {
    return { invalidJson: true };
  }
  if (Array.isArray(value) && value.length && !Object.hasOwn(value[0] ?? {}, "items")) {
    value = [{ title: "Checklist", items: value }];
  }
  const stripStableIds = (entry) => {
    if (Array.isArray(entry)) return entry.map(stripStableIds);
    if (entry && typeof entry === "object") {
      return Object.fromEntries(Object.entries(entry)
        .filter(([name]) => name !== "id")
        .map(([name, child]) => [name, stripStableIds(child)]));
    }
    return entry;
  };
  return canonicalJson(stripStableIds(value));
}

function stableIdentityDigests(raw, key) {
  let value;
  try {
    value = JSON.parse(String(raw));
  } catch {
    return [];
  }
  const identities = [];
  const visit = (entry, path = "$") => {
    if (Array.isArray(entry)) {
      entry.forEach((child, index) => visit(child, `${path}[${index}]`));
      return;
    }
    if (!entry || typeof entry !== "object") return;
    if (entry.id !== undefined && entry.id !== null && entry.id !== "") identities.push(hmac(`${path}\u001f${String(entry.id)}`, key));
    for (const [name, child] of Object.entries(entry)) {
      if (name !== "id") visit(child, `${path}.${name}`);
    }
  };
  visit(value);
  return identities.sort((left, right) => left.localeCompare(right, "en"));
}

function stableIdValueDigests(raw, key) {
  let value;
  try {
    value = JSON.parse(String(raw));
  } catch {
    return [];
  }
  const identities = [];
  const visit = (entry) => {
    if (Array.isArray(entry)) return entry.forEach(visit);
    if (!entry || typeof entry !== "object") return;
    if (entry.id !== undefined && entry.id !== null && entry.id !== "") identities.push(hmac(String(entry.id), key));
    Object.entries(entry).filter(([name]) => name !== "id").forEach(([, child]) => visit(child));
  };
  visit(value);
  return identities.sort((left, right) => left.localeCompare(right, "en"));
}

function expected0024StableIdentityDigests(raw, key) {
  let value;
  try {
    value = JSON.parse(String(raw));
  } catch {
    return [];
  }
  if (Array.isArray(value) && value.length && !Object.hasOwn(value[0] ?? {}, "items")) {
    value = [{ id: "1", title: "Checklist", items: value }];
  }
  if (!Array.isArray(value)) return stableIdentityDigests(raw, key);
  value.forEach((section, sectionIndex) => {
    if (!section || typeof section !== "object") return;
    if (section.id == null || section.id === "") section.id = `legacy-section-${sectionIndex + 1}`;
    const items = Array.isArray(section.items) ? section.items : [];
    items.forEach((item, itemIndex) => {
      if (!item || typeof item !== "object") return;
      if (item.id == null || item.id === "") item.id = `legacy-item-${sectionIndex + 1}-${itemIndex + 1}`;
      let subItemIndex = 0;
      for (const subItem of Array.isArray(item.subItems) ? item.subItems : []) {
        subItemIndex += 1;
        if (subItem && typeof subItem === "object" && (subItem.id == null || subItem.id === "")) {
          subItem.id = `legacy-subitem-${sectionIndex + 1}-${itemIndex + 1}-${subItemIndex}`;
        }
      }
      for (const content of Array.isArray(item.contents) ? item.contents : []) {
        for (const subItem of Array.isArray(content?.subItems) ? content.subItems : []) {
          subItemIndex += 1;
          if (subItem && typeof subItem === "object" && (subItem.id == null || subItem.id === "")) {
            subItem.id = `legacy-subitem-${sectionIndex + 1}-${itemIndex + 1}-${subItemIndex}`;
          }
        }
      }
    });
  });
  return stableIdentityDigests(JSON.stringify(value), key);
}

function resultRows(output, label) {
  const parsed = JSON.parse(output);
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  if (entries.length !== 1 || !Array.isArray(entries[0]?.results)) {
    throw new Error(`${label} must contain exactly one complete result set.`);
  }
  return entries[0].results;
}

export function privacySafeDomainSnapshot({ templateRows, runRows, key, hasEvolution }) {
  if ((key ?? "").length < 32) throw new Error("Domain snapshot requires a protected HMAC key.");
  const records = (kind, rows, evolvingColumns) => rows.map((row) => {
    if (typeof row?.id !== "string" || !row.id) throw new Error(`${kind} invariant row is missing its identity.`);
    const projection = Object.fromEntries(Object.entries(row)
      .filter(([name]) => name !== "id" && !evolvingColumns.includes(name))
      .map(([name, value]) => [name, name === "items" ? normalizedItems(value) : value]));
    return {
      key: hmac(`${kind}\u001f${row.id}`, key),
      stateDigest: hmac(`${kind}\u001f${JSON.stringify(canonicalJson(projection))}`, key),
      stableIdentityDigests: stableIdentityDigests(row.items, key),
      stableIdValueDigests: stableIdValueDigests(row.items, key),
      expected0024StableIdentityDigests: hasEvolution ? null : expected0024StableIdentityDigests(row.items, key),
      ...(kind === "template" ? {
        version: Number(row.version),
        contentVersion: hasEvolution ? Number(row.content_version) : null,
      } : {
        hasTemplate: row.template_id != null,
        templateVersion: hasEvolution ? Number(row.template_version) : null,
        revision: hasEvolution ? Number(row.revision) : null,
        retiredItemsDigest: hasEvolution ? hmac(JSON.stringify(normalizedItems(row.retired_items)), key) : null,
      }),
    };
  }).sort((left, right) => left.key.localeCompare(right.key, "en"));
  const templates = records("template", templateRows, ["version", "content_version"]);
  const runs = records("run", runRows, ["template_version", "revision", "retired_items"]);
  return {
    templates,
    runs,
    emptyRetiredItemsDigest: hmac(JSON.stringify([]), key),
    digest: hmac(JSON.stringify({ templates, runs }), key),
  };
}

export function compareDomainSnapshots({ pre, post, preHasEvolution, postHasEvolution }) {
  const failures = [];
  for (const kind of ["templates", "runs"]) {
    const before = new Map((pre?.[kind] ?? []).map((row) => [row.key, row]));
    const after = new Map((post?.[kind] ?? []).map((row) => [row.key, row]));
    if (before.size !== after.size || [...before.keys()].some((key) => !after.has(key))) {
      failures.push(`${kind} per-row identity set changed`);
      continue;
    }
    for (const [key, oldRow] of before) {
      const newRow = after.get(key);
      if (oldRow.stateDigest !== newRow.stateDigest) failures.push(`${kind} per-row preserved state changed`);
      if (!preHasEvolution && postHasEvolution) {
        if (JSON.stringify(oldRow.expected0024StableIdentityDigests) !== JSON.stringify(newRow.stableIdentityDigests)) {
          failures.push(`${kind} stable identities do not match the reviewed 0024 backfill`);
        }
      } else if (JSON.stringify(oldRow.stableIdentityDigests) !== JSON.stringify(newRow.stableIdentityDigests)) {
        failures.push(`${kind} stable identity changed, moved, appeared, or disappeared`);
      }
      if (kind === "templates") {
        if (!preHasEvolution && postHasEvolution) {
          if (newRow.version !== oldRow.version + 1 || newRow.contentVersion !== oldRow.version + 1) {
            failures.push("template version transition is not the reviewed 0024 increment");
          }
        } else if (newRow.version !== oldRow.version || newRow.contentVersion !== oldRow.contentVersion) {
          failures.push("template version state changed unexpectedly");
        }
      } else if (!preHasEvolution && postHasEvolution) {
        if (newRow.revision !== 1 || newRow.templateVersion !== (oldRow.hasTemplate ? 0 : 1) || newRow.retiredItemsDigest !== post.emptyRetiredItemsDigest) {
          failures.push("run version or retired-item transition is not the reviewed 0024 initialization");
        }
      } else if (newRow.templateVersion !== oldRow.templateVersion || newRow.revision !== oldRow.revision || newRow.retiredItemsDigest !== oldRow.retiredItemsDigest) {
        failures.push("run version or retired-item state changed unexpectedly");
      }
    }
  }
  if (preHasEvolution && !postHasEvolution) failures.push("schema evolution state regressed");
  return { failures: [...new Set(failures)], verdict: failures.length ? "fail" : "pass" };
}

export function compareProductionInvariants({ pre, post, preHasEvolution = true, postHasEvolution = true, requireOwnershipDigest = true, preDomain, postDomain }) {
  const stable = ["users", "templates", "templates_active", "templates_deleted", "template_owners", "runs", "runs_active", "runs_deleted", "run_owners", ...(requireOwnershipDigest ? ["ownershipDigest"] : [])];
  const baseline = [...stable, "templates_invalid_json", "templates_invalid_version", "runs_invalid_json", "orphaned_templates", "orphaned_runs"];
  const evolution = ["templates_invalid_content_version", "runs_invalid_template_version", "runs_invalid_revision", "runs_invalid_retired_json"];
  const omitted = [
    ...baseline.filter((name) => pre[name] === undefined || post[name] === undefined),
    ...(preHasEvolution ? evolution.filter((name) => pre[name] === undefined) : []),
    ...(postHasEvolution ? evolution.filter((name) => post[name] === undefined) : []),
  ];
  const zero = Object.keys(post).filter((name) => name.includes("invalid") || name.startsWith("orphaned_"));
  const domain = preDomain && postDomain
    ? compareDomainSnapshots({ pre: preDomain, post: postDomain, preHasEvolution, postHasEvolution })
    : { failures: ["per-row domain snapshot omitted"], verdict: "fail" };
  const failures = [
    ...omitted.map((name) => `${name} omitted`),
    ...stable.filter((name) => pre[name] !== undefined && post[name] !== pre[name]).map((name) => `${name} changed from ${pre[name]} to ${post[name]}`),
    ...zero.filter((name) => post[name] !== 0).map((name) => `${name} is ${post[name]}`),
    ...domain.failures,
  ];
  return { pre, post, preDomainDigest: preDomain?.digest ?? null, postDomainDigest: postDomain?.digest ?? null, failures, verdict: failures.length ? "fail" : "pass" };
}

const OWNER_SQL = "SELECT 'template' kind,id,user_id,CASE WHEN deleted_at IS NULL THEN 'active' ELSE 'deleted' END deleted_state FROM templates UNION ALL SELECT 'run',id,user_id,CASE WHEN deleted_at IS NULL THEN 'active' ELSE 'deleted' END FROM checklist_runs";

export function captureRemoteInvariantSnapshot({ database, key, runWrangler }) {
  const ledger = parseAppliedMigrationLedger(runWrangler([
    "d1", "execute", database, "--remote", "--json", "--command",
    "SELECT id, name FROM d1_migrations ORDER BY id",
  ]));
  const selected = selectInvariantSqlFiles({ appliedMigrations: ledger });
  const combined = selected.flatMap((definition) => {
    const parsed = JSON.parse(runWrangler([
      "d1", "execute", database, "--remote", "--json", "--file", definition.path,
    ]));
    return Array.isArray(parsed) ? parsed : [parsed];
  });
  const invariants = parseInvariantOutput(JSON.stringify(combined));
  const ownerOutput = JSON.parse(runWrangler([
    "d1", "execute", database, "--remote", "--json", "--command", OWNER_SQL,
  ]));
  const ownerEntries = Array.isArray(ownerOutput) ? ownerOutput : [ownerOutput];
  invariants.ownershipDigest = privacySafeOwnershipDigest({
    rows: ownerEntries.flatMap((entry) => entry.results ?? []),
    key,
  });
  const templateRows = resultRows(runWrangler([
    "d1", "execute", database, "--remote", "--json", "--command", "SELECT * FROM templates ORDER BY id",
  ]), "Template domain invariants");
  const runRows = resultRows(runWrangler([
    "d1", "execute", database, "--remote", "--json", "--command", "SELECT * FROM checklist_runs ORDER BY id",
  ]), "Run domain invariants");
  const hasEvolution = ledger.includes("0024_safe_template_evolution.sql");
  return {
    invariants,
    domain: privacySafeDomainSnapshot({ templateRows, runRows, key, hasEvolution }),
    hasEvolution,
    appliedThrough: ledger.at(-1),
    sqlVersions: selected.map((definition) => definition.minimumMigration),
  };
}
