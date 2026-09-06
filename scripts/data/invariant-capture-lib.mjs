import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createHash, createHmac } from "node:crypto";
import { DuplicateJsonKeyError, InexactJsonNumberError, parseExactJson } from "./strict-json-lib.mjs";
import { assertPre0024Compatibility } from "./pre0024-compatibility-lib.mjs";
import { validateQueryResultEnvelopes as resultEnvelopes } from './d1-query-envelope.mjs';

const MIGRATION_PATTERN = /^\d{4}_[a-z0-9_]+\.sql$/;
const SQLITE_TYPES = Symbol("captured SQLite storage types");
const BASELINE_FILE = fileURLToPath(new URL("./sql/capture-invariants.sql", import.meta.url));
const EVOLUTION_FILE = fileURLToPath(
  new URL("./sql/capture-invariants-0024.sql", import.meta.url),
);

export function parseAppliedMigrationLedger(output, { allowEmpty = false } = {}) {
  const rows = resultRows(output, "Applied migration ledger");
  const names = rows.map(row => {
    if (typeof row.name !== 'string' || !MIGRATION_PATTERN.test(row.name)) {
      throw new Error("Applied migration ledger contains a malformed migration identity.");
    }
    return row.name;
  });
  if (names.length === 0) {
    if (allowEmpty) return [];
    throw new Error("Applied migration ledger did not contain recognized migration names.");
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
  const rows = resultEnvelopes(output, "Invariant").flatMap(entry => entry.results);
  const foreignKeys = rows.filter((row) => row?.invariant === "foreign_key_violations");
  if (foreignKeys.length !== 1 || !Number.isSafeInteger(foreignKeys[0].total_rows) || foreignKeys[0].total_rows < 0) {
    throw new Error("Foreign-key violation count is missing or malformed.");
  }
  if (rows.some(row => typeof row?.invariant !== "string" || !Number.isSafeInteger(row.total_rows) || row.total_rows < 0) ||
      new Set(rows.map(row => row.invariant)).size !== rows.length) throw new Error("Invariant counts are missing or malformed.");
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
  // BLOBs are stored bytes, not JavaScript strings. Do not normalize or decode
  // them: even valid SQLite JSON BLOBs must retain their exact stored value.
  if (raw instanceof Uint8Array) return { sqliteBlob: Buffer.from(raw).toString("hex") };
  let value = preservedItems(raw, "Active");
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

function parseInvariantTransport(output) {
  try {
    return parseExactJson(output);
  } catch {
    throw new Error("Invariant transport evidence is missing or malformed.");
  }
}

function preservedItems(raw, label) {
  let value;
  try {
    // Preserve identities, references, JSON types, and array positions in full.
    value = parseExactJson(raw);
  } catch (error) {
    if (error instanceof DuplicateJsonKeyError) throw error;
    if (error instanceof InexactJsonNumberError) throw new Error(`${label} invariant capture contains an unsupported numeric value.`);
    return { invalidJson: true };
  }
  return canonicalJson(value);
}

function stableIdentityDigests(raw, key) {
  let value;
  try {
    value = JSON.parse(String(raw));
  } catch {
    return [];
  }
  const identities = [];
  const visit = (entry, path = []) => {
    if (Array.isArray(entry)) {
      entry.forEach((child, index) => visit(child, [...path, ["index", index]]));
      return;
    }
    if (!entry || typeof entry !== "object") return;
    if (Object.hasOwn(entry, "id")) identities.push(hmac(JSON.stringify([path, canonicalJson(entry.id)]), key));
    for (const [name, child] of Object.entries(entry)) {
      if (name !== "id") visit(child, [...path, ["key", name]]);
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

export { resultEnvelopes as validateQueryResultEnvelopes };

function resultRows(output, label) {
  const entries = resultEnvelopes(output, label);
  if (entries.length !== 1) {
    throw new Error(`${label} must contain exactly one complete result set.`);
  }
  return entries[0].results;
}

function captureTypedRows({ table, database, runWrangler }) {
  const query = sql => resultRows(runWrangler([
    "d1", "execute", database, "--remote", "--json", `--command=${sql}`,
  ]), "Typed source rows");
  // Discover the actual pre/post schema. Encode inside SQLite before Wrangler
  // changes NULL cells. REAL uses round-trip text: plain json_object rounds it.
  const columns = query(`SELECT name FROM pragma_table_xinfo('${table}') WHERE hidden != 1 ORDER BY cid`).map(row => row.name);
  if (!columns.length || columns.some(name => typeof name !== "string" || !name) || new Set(columns).size !== columns.length) {
    throw new Error("Typed source row column inventory is missing or malformed.");
  }
  const identifier = name => `"${name.replaceAll('"', '""')}"`;
  const fields = columns.map(name => {
    const column = identifier(name);
    return `'${name.replaceAll("'", "''")}',json_array(typeof(${column}),CASE typeof(${column}) WHEN 'real' THEN printf('%!.26g',${column}) WHEN 'blob' THEN hex(${column}) ELSE ${column} END)`;
  }).join(",");
  return query(`SELECT json_object(${fields}) AS typed_row FROM ${identifier(table)} ORDER BY "id"`).map(envelope => {
    if (typeof envelope?.typed_row !== "string" || Object.keys(envelope).length !== 1) throw new Error("Typed source row envelope is missing or malformed.");
    const values = parseInvariantTransport(envelope.typed_row);
    if (!values || Array.isArray(values) || typeof values !== "object" || Object.keys(values).length !== columns.length || columns.some(name => !Object.hasOwn(values, name))) {
      throw new Error("Typed source row fields do not match the captured schema.");
    }
    const types = {};
    const row = Object.fromEntries(columns.map(name => {
      const cell = values[name];
      if (!Array.isArray(cell) || cell.length !== 2) throw new Error("Typed source row value is malformed.");
      const [type, value] = cell;
      let decoded;
      if (type === "null" && value === null) decoded = null;
      else if (type === "text" && typeof value === "string") decoded = value;
      else if (type === "integer" && typeof value === "number" && Number.isInteger(value)) decoded = value;
      else if (type === "real" && typeof value === "string" && /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value) && Number.isFinite(Number(value)) &&
          (Number(value) !== 0 || !/[1-9]/.test(value.split(/[eE]/)[0]))) decoded = Number(value);
      else if (type === "blob" && typeof value === "string" && /^(?:[0-9A-F]{2})*$/.test(value)) decoded = Uint8Array.from(Buffer.from(value, "hex"));
      else throw new Error("Typed source row value is malformed.");
      Object.defineProperty(types, name, {value:type, enumerable:true});
      return [name, decoded];
    }));
    Object.defineProperty(row, SQLITE_TYPES, {value:types});
    return row;
  });
}

export function privacySafeDomainSnapshot({ templateRows, runRows, key, hasEvolution }) {
  if ((key ?? "").length < 32) throw new Error("Domain snapshot requires a protected HMAC key.");
  const records = (kind, rows, evolvingColumns) => rows.map((row) => {
    if (typeof row?.id !== "string" || !row.id) throw new Error(`${kind} invariant row is missing its identity.`);
    const projection = Object.fromEntries(Object.entries(row)
      .filter(([name]) => name !== "id" && !evolvingColumns.includes(name))
      .map(([name, value]) => [name, name === "items" ? normalizedItems(value) : value]));
    const storageTypes = row[SQLITE_TYPES] && Object.fromEntries(Object.entries(row[SQLITE_TYPES])
      .filter(([name]) => name !== "id" && !evolvingColumns.includes(name)));
    const numericVersion = name => {
      if (typeof row[name] !== "number" || !Number.isFinite(row[name])) throw new Error("Invariant version value has an unsupported SQLite type.");
      return row[name];
    };
    return {
      key: hmac(`${kind}\u001f${row.id}`, key),
      stateDigest: hmac(`${kind}\u001f${JSON.stringify(canonicalJson({ values: projection, storageTypes }))}`, key),
      stableIdentityDigests: stableIdentityDigests(row.items, key),
      stableIdValueDigests: stableIdValueDigests(row.items, key),
      expected0024StableIdentityDigests: hasEvolution ? null : expected0024StableIdentityDigests(row.items, key),
      ...(kind === "template" ? {
        version: numericVersion("version"),
        contentVersion: hasEvolution ? numericVersion("content_version") : null,
      } : {
        hasTemplate: row.template_id != null,
        templateVersion: hasEvolution ? numericVersion("template_version") : null,
        revision: hasEvolution ? numericVersion("revision") : null,
        retiredItemsDigest: hasEvolution ? hmac(row.retired_items instanceof Uint8Array
          ? `blob\u0000${Buffer.from(row.retired_items).toString("hex")}`
          : JSON.stringify(preservedItems(row.retired_items, "Retired")), key) : null,
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
    ...[pre, post].flatMap((values, index) => values.foreign_key_violations === 0
      ? [] : [`${index === 0 ? "pre" : "post"} foreign-key violation count must be present and zero`]),
    ...omitted.map((name) => `${name} omitted`),
    ...stable.filter((name) => pre[name] !== undefined && post[name] !== pre[name]).map((name) => `${name} changed from ${pre[name]} to ${post[name]}`),
    ...zero.filter((name) => post[name] !== 0).map((name) => `${name} is ${post[name]}`),
    ...domain.failures,
  ];
  return { pre, post, preDomainDigest: preDomain?.digest ?? null, postDomainDigest: postDomain?.digest ?? null, failures, verdict: failures.length ? "fail" : "pass" };
}

const OWNER_SQL = "SELECT 'template' kind,id,user_id,CASE WHEN deleted_at IS NULL THEN 'active' ELSE 'deleted' END deleted_state FROM templates UNION ALL SELECT 'run',id,user_id,CASE WHEN deleted_at IS NULL THEN 'active' ELSE 'deleted' END FROM checklist_runs";

// Internal consistency of protected evidence, not a substitute for the external
// artifact attestation and exact-request authorization enforced by the caller.
export function assertInvariantSafetySummary({ step, summary, pendingMigrations }) {
  if (!summary || !Object.hasOwn(summary, "foreignKeyViolations") || summary.foreignKeyViolations !== 0) throw new Error("Production foreign-key evidence must be a typed zero count.");
  const aggregate = summary.aggregateCounts;
  const coverage = summary.sourceCoverage;
  const domainDigest = step === "post-invariants" ? summary.postDomainDigest : summary.domainDigest;
  if (!Number.isSafeInteger(aggregate?.templates) || aggregate.templates < 0 ||
      !Number.isSafeInteger(aggregate?.runs) || aggregate.runs < 0 || coverage?.verdict !== "pass" ||
      coverage.templateCount !== aggregate.templates || coverage.runCount !== aggregate.runs ||
      typeof domainDigest !== "string" || !/^[a-f0-9]{64}$/.test(domainDigest) || coverage.domainDigest !== domainDigest) {
    throw new Error("Production source coverage counts or domain binding are missing or inconsistent.");
  }
  if (step === "pre-invariants" && pendingMigrations.includes("0024_safe_template_evolution.sql")) {
    const proof = summary.pre0024Compatibility;
    if (proof?.migration !== "0024_safe_template_evolution.sql" || proof.verdict !== "pass" ||
        proof.templateCount !== aggregate.templates || proof.runCount !== aggregate.runs || proof.domainDigest !== domainDigest) {
      throw new Error("Production 0024 compatibility counts or domain binding are missing or inconsistent.");
    }
  }
}

export function assertInvariantSummaryTransition({ pre, post }) {
  if (pre.aggregateCounts.templates !== post.aggregateCounts.templates || pre.aggregateCounts.runs !== post.aggregateCounts.runs || post.preDomainDigest !== pre.domainDigest) {
    throw new Error("Production invariant counts or source domain changed across the comparison.");
  }
}

function assertCompleteSourceRows({ invariants, templateRows, runRows, ownerRows }) {
  const fail = () => { throw new Error("Source row counts, identities, or ownership do not agree."); };
  const expectedOwners = new Map();
  for (const [kind, rows, count] of [["template", templateRows, invariants.templates], ["run", runRows, invariants.runs]]) {
    if (!Number.isSafeInteger(count) || count < 0 || rows.length !== count) fail();
    for (const row of rows) {
      if (typeof row?.id !== "string" || !row.id || typeof row.user_id !== "string" || !row.user_id) fail();
      const identity = JSON.stringify([kind, row.id]);
      if (expectedOwners.has(identity)) fail();
      expectedOwners.set(identity, { user_id: row.user_id, deleted_state: row.deleted_at == null ? "active" : "deleted" });
    }
  }
  if (ownerRows.length !== expectedOwners.size) fail();
  for (const owner of ownerRows) {
    const identity = JSON.stringify([owner?.kind, owner?.id]);
    const expected = expectedOwners.get(identity);
    if (!expected || owner.user_id !== expected.user_id || owner.deleted_state !== expected.deleted_state) fail();
    expectedOwners.delete(identity);
  }
  if (expectedOwners.size) fail();
}

export function captureRemoteInvariantSnapshot({ database, key, runWrangler, validateLedger = (ledger) => ledger, repoRoot = fileURLToPath(new URL("../../", import.meta.url)) }) {
  const ledger = validateLedger(parseAppliedMigrationLedger(runWrangler([
    "d1", "execute", database, "--remote", "--json",
    "--command=SELECT id, name FROM d1_migrations ORDER BY id",
  ])));
  const selected = selectInvariantSqlFiles({ appliedMigrations: ledger });
  const combined = selected.flatMap((definition) => {
    return resultEnvelopes(runWrangler([
      "d1", "execute", database, "--remote", "--json", `--command=${readFileSync(definition.path, "utf8")}`,
    ]), "Invariant");
  });
  const invariants = parseInvariantOutput(JSON.stringify(combined));
  if (invariants.foreign_key_violations !== 0) throw new Error("Foreign-key violation count must be zero before invariant evidence can pass.");
  const ownerRows = resultRows(runWrangler([
    "d1", "execute", database, "--remote", "--json", `--command=${OWNER_SQL}`,
  ]), "Source row ownership");
  const templateRows = captureTypedRows({ table: "templates", database, runWrangler });
  const runRows = captureTypedRows({ table: "checklist_runs", database, runWrangler });
  const hasEvolution = ledger.includes("0024_safe_template_evolution.sql");
  assertCompleteSourceRows({ invariants, templateRows, runRows, ownerRows });
  invariants.ownershipDigest = privacySafeOwnershipDigest({ rows: ownerRows, key });
  const domain = privacySafeDomainSnapshot({ templateRows, runRows, key, hasEvolution });
  if (!hasEvolution) assertPre0024Compatibility({ repoRoot, templates: templateRows, runs: runRows });
  return {
    invariants,
    domain,
    sourceCoverage: { verdict: "pass", templateCount: templateRows.length, runCount: runRows.length, domainDigest: domain.digest },
    pre0024Compatibility: hasEvolution ? null : {
      migration: "0024_safe_template_evolution.sql", verdict: "pass",
      templateCount: templateRows.length, runCount: runRows.length, domainDigest: domain.digest,
    },
    hasEvolution,
    appliedThrough: ledger.at(-1),
    appliedMigrations: ledger,
    ledgerSha256: createHash("sha256").update(JSON.stringify(ledger)).digest("hex"),
    sqlVersions: selected.map((definition) => definition.minimumMigration),
  };
}
