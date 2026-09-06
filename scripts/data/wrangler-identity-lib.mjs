import { execFileSync } from "node:child_process";
import { sanitizedGitEnvironment } from "./git-subprocess-env.mjs";
import { parseStrictJson } from './strict-json-lib.mjs';

export function extractD1Identity(output) {
  let parsed;
  try {
    parsed = parseStrictJson(output);
  } catch {
    throw new Error("Wrangler D1 identity output was not valid JSON.");
  }
  if (Array.isArray(parsed) && parsed.length !== 1) throw new Error('Wrangler D1 identity requires exactly one record.');
  const entry = Array.isArray(parsed) ? parsed[0] : parsed;
  // Identity fields never override an explicit provider failure. Flat Wrangler
  // records need no success envelope, but any supplied status must be valid.
  if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
      Object.hasOwn(entry, 'error') ||
      (Object.hasOwn(entry, 'success') && entry.success !== true) ||
      (Object.hasOwn(entry, 'errors') && (!Array.isArray(entry.errors) || entry.errors.length !== 0)) ||
      (Object.hasOwn(entry, 'uuid') && Object.hasOwn(entry, 'database_id') && entry.uuid !== entry.database_id) ||
      (Object.hasOwn(entry, 'name') && Object.hasOwn(entry, 'database_name') && entry.name !== entry.database_name)) {
    throw new Error('Wrangler D1 identity response failed status or ambiguity validation.');
  }
  const databaseId = entry?.uuid ?? entry?.database_id;
  const databaseName = entry?.name ?? entry?.database_name;
  if (typeof databaseId !== "string" || typeof databaseName !== "string") {
    throw new Error("Wrangler D1 identity output did not include an immutable database UUID and name.");
  }
  return { databaseId, databaseName };
}

export function resolveRemoteD1Identity(database, { repoRoot = process.cwd(), env = process.env } = {}) {
  const output = execFileSync(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["exec", "wrangler", "d1", "info", database, "--json"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: sanitizedGitEnvironment(env),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const identity = extractD1Identity(output);
  if (identity.databaseName !== database) {
    throw new Error(`Wrangler resolved ${database} to unexpected D1 database ${identity.databaseName}.`);
  }
  return identity;
}
