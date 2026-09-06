import { createHash, createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { validateQueryResultEnvelopes } from './d1-query-envelope.mjs';

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const unsupported = () => { throw new Error("Unsupported or ambiguous D1 full export; restore refused."); };

// This is a lexer for the D1 dump envelope, not a general SQL parser. Keep
// original slices, including comments. Only CREATE TRIGGER has internal statement
// delimiters; CASE/END nesting must not be confused with its final END.
function statements(sql) {
  const result = [];
  let start = 0, i = 0, tokens = [], triggerBody = false, cases = 0, triggerEnd = false;
  const add = (value, kind = "word") => tokens.push({ value, kind });
  while (i < sql.length) {
    const c = sql[i];
    if (/\s/.test(c)) { i++; continue; }
    if (sql.startsWith("--", i)) { const end = sql.indexOf("\n", i); i = end < 0 ? sql.length : end + 1; continue; }
    if (sql.startsWith("/*", i)) {
      const end = sql.indexOf("*/", i + 2);
      if (end < 0 || sql.slice(i + 2, end).includes("/*")) unsupported();
      i = end + 2; continue;
    }
    if ("'\"`[".includes(c)) {
      const endQuote = c === "[" ? "]" : c;
      const begin = i++;
      let closed = false;
      while (i < sql.length) {
        if (sql[i++] !== endQuote) continue;
        if (c !== "[" && sql[i] === endQuote) { i++; continue; }
        closed = true; break;
      }
      if (!closed) unsupported();
      add(sql.slice(begin, i), c === "'" ? "string" : "identifier"); continue;
    }
    const word = /^[A-Za-z_][A-Za-z_0-9$]*/.exec(sql.slice(i));
    if (word) {
      const value = word[0].toUpperCase(); add(value); i += word[0].length;
      const trigger = tokens[0]?.value === "CREATE" && tokens[1]?.value === "TRIGGER";
      if (trigger) {
        if (value === "CASE") cases++;
        if (value === "BEGIN") { if (triggerBody || cases || triggerEnd) unsupported(); triggerBody = true; }
        if (value === "END") {
          if (cases) cases--;
          else if (triggerBody && tokens.at(-2)?.value === ";") { triggerBody = false; triggerEnd = true; }
          else unsupported();
        }
      }
      continue;
    }
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(sql.slice(i));
    if (number) { add(number[0], "number"); i += number[0].length; continue; }
    if (c === ";" && !triggerBody) {
      if (!tokens.length || cases) unsupported();
      if (tokens[0]?.value === "CREATE" && tokens[1]?.value === "TRIGGER" && !triggerEnd) unsupported();
      result.push({ sql: sql.slice(start, i + 1), tokens, ordinal: result.length });
      start = ++i; tokens = []; triggerEnd = false; continue;
    }
    if (triggerEnd || !"(),.;=+-*/%<>!|&~".includes(c)) unsupported();
    add(c, "symbol"); i++;
  }
  if (tokens.length || triggerBody || cases) unsupported();
  return { statements: result, tail: sql.slice(start) };
}

function identifier(token) {
  if (!token) unsupported();
  if (token.kind === "word") return token.value.toLowerCase();
  if (!["identifier", "string"].includes(token.kind)) unsupported();
  const q = token.value[0], end = q === "[" ? "]" : q;
  return token.value.slice(1, -1).replaceAll(end + end, end).toLowerCase();
}

export function prepareRecoveryExport(source) {
  const bytes = Buffer.isBuffer(source) ? source : Buffer.from(source);
  const sql = bytes.toString("utf8");
  if (!Buffer.from(sql).equals(bytes) || sql.includes("\0")) unsupported();
  const parsed = statements(sql), entries = parsed.statements;
  if (entries[0]?.tokens.map(t => t.value).join(" ") !== "PRAGMA DEFER_FOREIGN_KEYS = TRUE") unsupported();
  const tables = [], data = [], objects = [], names = new Set();
  let postData = false;
  for (const entry of entries.slice(1)) {
    const t = entry.tokens, words = t.map(token => token.value);
    if (words[0] === "CREATE" && words[1] === "TABLE") {
      if (postData) unsupported();
      let n = 2;
      if (words.slice(n, n + 3).join(" ") === "IF NOT EXISTS") n += 3;
      const name = identifier(t[n]);
      if (words[n + 1] !== "(" || names.has(name) || /^(sqlite_|_cf_)/i.test(name)) unsupported();
      names.add(name); tables.push(entry);
    } else if (words[0] === "INSERT" && words[1] === "INTO") {
      if (postData) unsupported();
      const name = identifier(t[2]);
      if ((!names.has(name) && name !== "sqlite_sequence") || words[3] !== "VALUES" || words[4] !== "(" || words.at(-1) !== ")") unsupported();
      // D1 emits literal cells, blobs, and replace/char for CR/LF. No SELECT,
      // RETURNING, conflict clauses, schema-qualified targets, or SQL functions
      // with effects are accepted in the data section.
      for (const token of t.slice(4)) {
        if (token.kind === "identifier" || (token.kind === "word" && !["NULL", "X", "REPLACE", "CHAR"].includes(token.value))) unsupported();
        if (token.kind === "symbol" && !["(", ")", ",", "+", "-"].includes(token.value)) unsupported();
      }
      data.push(entry);
    } else if (words.length === 3 && words[0] === "DELETE" && words[1] === "FROM" && identifier(t[2]) === "sqlite_sequence") {
      if (postData) unsupported();
      data.push(entry);
    } else if (words[0] === "CREATE" && (["INDEX", "TRIGGER", "VIEW"].includes(words[1]) || (words[1] === "UNIQUE" && words[2] === "INDEX"))) {
      postData = true; objects.push(entry);
    } else unsupported();
  }
  if (!tables.length) unsupported();
  const ordered = [entries[0], ...tables, ...data, ...objects];
  const preparedSql = ordered.map(entry => entry.sql).join("") + parsed.tail;
  const validation = new DatabaseSync(":memory:");
  try {
    validation.exec("PRAGMA foreign_keys=ON; BEGIN;");
    validation.exec(preparedSql);
    if (validation.prepare("PRAGMA foreign_key_check").all().length) unsupported();
    validation.exec("COMMIT;");
  } catch { unsupported(); }
  finally { validation.close(); }
  return {
    sql: preparedSql,
    metadata: {
      format: "d1-full-export-tables-first-v1", sourceSha256: sha256(bytes),
      preparedSha256: sha256(preparedSql), sourceBytes: bytes.length,
      preparedBytes: Buffer.byteLength(preparedSql),
      statementCount: entries.length, tableCount: tables.length, dataStatementCount: data.length,
      postDataObjectCount: objects.length,
      // Ordinals bind the transformation without exposing SQL or identifiers.
      sourceOrdinals: ordered.map(entry => entry.ordinal),
      foreignKeys: "original-deferred-pragma-single-import", postDataObjects: "original-order-after-data",
    },
  };
}

// The command and the real D1 test share this exact file lifecycle and transform.
// The export belongs to the caller (workflow EXIT trap); prepared plaintext is
// always removed, including on import/verification failure. No reusable sidecar.
export function withPreparedRecoveryImport({ inputPath, expectedSourceSha256, execute }) {
  const prepared = prepareRecoveryExport(readFileSync(inputPath));
  if (prepared.metadata.sourceSha256 !== expectedSourceSha256) throw new Error("Recovery export digest changed; restore refused.");
  const directory = mkdtempSync(path.join(path.dirname(inputPath), "prepared-restore-"));
  try {
    const file = path.join(directory, "import.sql");
    writeFileSync(file, prepared.sql, { mode: 0o600, flag: "wx" });
    if (sha256(readFileSync(file)) !== prepared.metadata.preparedSha256) throw new Error("Prepared recovery digest mismatch.");
    return { output: execute(file), metadata: prepared.metadata };
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

// Complete SQL-visible rows (including ledger timestamps and sqlite_sequence)
// and catalog. SQL quote() avoids lossy JS integer conversion. Reports contain
// keyed digests only, never rows or object definitions.
export function captureFullRecoveryState({ query, key }) {
  if (typeof key !== "string" || key.length < 32) throw new Error("Recovery equality requires an HMAC key of at least 32 characters.");
  const rows = sql => {
    const entries = validateQueryResultEnvelopes(query(sql), 'Recovery equality');
    if (entries.length !== 1) throw new Error('Recovery equality requires exactly one query result set.');
    return entries[0].results;
  };
  const digest = value => createHmac("sha256", key).update(JSON.stringify(value)).digest("hex");
  const quoteId = name => '"' + name.replaceAll('"', '""') + '"';
  // Keep application objects even when their names resemble platform names.
  // Unlike schema comparison, recovery includes the ledger and sqlite_sequence.
  const catalog = rows("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE NOT (type = 'table' AND name = '_cf_METADATA') ORDER BY type, name");
  const data = [];
  for (const table of catalog.filter(row => row.type === "table")) {
    const columns = rows(`PRAGMA table_xinfo(${quoteId(table.name)})`).filter(row => row.hidden !== 1);
    if (!columns.length) throw new Error("Unsupported recovery table shape.");
    const values = rows(`SELECT ${columns.map((column, index) => {
      const name = quoteId(column.name);
      return `typeof(${name}) || ':' || CASE WHEN typeof(${name}) IN ('text','blob') THEN hex(${name}) ELSE quote(${name}) END AS c${index}`;
    }).join(",")} FROM ${quoteId(table.name)}`);
    data.push([table.name, values.map(row => JSON.stringify(row)).sort()]);
  }
  const foreignKeys = rows("PRAGMA foreign_key_check");
  // D1 rejects integrity_check with SQLITE_AUTH. Its supported quick_check is
  // combined here with exact catalog/all-row equality and foreign-key checks.
  const integrity = rows("PRAGMA quick_check");
  if (foreignKeys.length || integrity.length !== 1 || Object.values(integrity[0])[0] !== "ok") throw new Error("Recovery integrity or foreign key check failed.");
  return { version: 1, catalogSha256: digest(catalog), dataSha256: digest(data), tableCount: data.length, foreignKeyViolations: 0, integrityCheck: 'quick_check', integrity: "ok" };
}

export function fullRecoveryStatesEqual(before, after) {
  const valid = value => value?.version === 1 && /^[a-f0-9]{64}$/.test(value.catalogSha256 ?? "") && /^[a-f0-9]{64}$/.test(value.dataSha256 ?? "") && Number.isInteger(value.tableCount) && value.tableCount > 0 && value.foreignKeyViolations === 0 && value.integrityCheck === 'quick_check' && value.integrity === "ok";
  return valid(before) && valid(after) && JSON.stringify(before) === JSON.stringify(after);
}
