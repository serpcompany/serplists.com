import { extractD1Identity } from "./wrangler-identity-lib.mjs";

function assertExpectedIdentity(identity, expected) {
  if (identity.databaseName !== expected.databaseName || identity.databaseId !== expected.databaseId) {
    throw new Error(`Production D1 identity changed: expected ${expected.databaseName} (${expected.databaseId}), observed ${identity.databaseName} (${identity.databaseId}).`);
  }
}

export function runProductionIdentityBoundCommand({
  environment,
  database,
  operation,
  commandArgs,
  runWrangler,
}) {
  if (environment !== "production") throw new Error("Identity-bound command helper is production-only.");
  if (!database?.databaseName || !database?.databaseId || !operation || !Array.isArray(commandArgs) || !commandArgs.length) {
    throw new Error("Production identity-bound command arguments are incomplete.");
  }
  if (commandArgs[0] !== "d1" || !commandArgs.includes(database.databaseName) || commandArgs.slice(0, 2).join(" ") === "d1 info") {
    throw new Error("Production identity-bound helper permits exactly one named non-identity D1 command.");
  }

  const resolve = () => extractD1Identity(runWrangler(["d1", "info", database.databaseName, "--json"]));
  const before = resolve();
  assertExpectedIdentity(before, database);
  let output;
  let operationError;
  try {
    output = runWrangler(commandArgs);
  } catch (error) {
    operationError = error;
  }
  const after = resolve();
  assertExpectedIdentity(after, database);
  if (operationError) throw operationError;

  return {
    output,
    observedIdentity: {
      environment: "production",
      binding: "DB",
      databaseName: database.databaseName,
      databaseId: database.databaseId,
      before,
      after,
    },
    operation,
  };
}
