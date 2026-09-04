import { execFileSync } from "node:child_process";

export function extractD1Identity(output) {
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error("Wrangler D1 identity output was not valid JSON.");
  }
  const entry = Array.isArray(parsed) ? parsed[0] : parsed;
  const databaseId = entry?.uuid ?? entry?.database_id;
  const databaseName = entry?.name ?? entry?.database_name;
  if (typeof databaseId !== "string" || typeof databaseName !== "string") {
    throw new Error("Wrangler D1 identity output did not include an immutable database UUID and name.");
  }
  return { databaseId, databaseName };
}

export function resolveRemoteD1Identity(database) {
  const output = execFileSync(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["exec", "wrangler", "d1", "info", database, "--json"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const identity = extractD1Identity(output);
  if (identity.databaseName !== database) {
    throw new Error(`Wrangler resolved ${database} to unexpected D1 database ${identity.databaseName}.`);
  }
  return identity;
}
