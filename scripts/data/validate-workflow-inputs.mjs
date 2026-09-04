const mode = process.argv[2];
const productionPatterns = {
  EXPECTED_COMMIT: /^[0-9a-f]{40}$/,
  MIGRATION_FROM: /^(?:none|\d{4}_[a-z0-9_]+\.sql)$/,
  MIGRATION_TO: /^(?:none|\d{4}_[a-z0-9_]+\.sql)$/,
  MIGRATION_CLASSIFICATION: /^(?:additive|backfill|destructive|irreversible)$/,
  CI_RUN_ID: /^\d+$/,
  REHEARSAL_RUN_ID: /^\d+$/,
  CONFIRM_PRODUCTION_DATABASE_ID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
};
const rehearsalPatterns = {
  EXPECTED_COMMIT: /^[0-9a-f]{40}$/,
  DATABASE_NAME: /^[a-z0-9][a-z0-9-]{2,62}$/,
  DATABASE_ID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  RECOVERY_DATABASE_NAME: /^[a-z0-9][a-z0-9-]{2,62}$/,
  RECOVERY_DATABASE_ID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  MIGRATION_FROM: /^(?:none|\d{4}_[a-z0-9_]+\.sql)$/,
  MIGRATION_TO: /^(?:none|\d{4}_[a-z0-9_]+\.sql)$/,
};
const approvalPatterns = {
  REQUEST_CLASSIFICATION: /^(?:additive|backfill|destructive|irreversible)$/,
};
try {
  const patterns = mode === "production"
    ? productionPatterns
    : mode === "rehearsal"
      ? rehearsalPatterns
      : mode === "approval"
        ? approvalPatterns
        : null;
  if (!patterns) throw new Error("Unknown workflow input validation mode.");
  for (const [name, pattern] of Object.entries(patterns)) {
    if (!pattern.test(process.env[name] ?? "")) throw new Error(`Invalid workflow input ${name}.`);
  }
  if (mode !== "approval" && process.env.GITHUB_SHA !== process.env.EXPECTED_COMMIT) throw new Error("Workflow commit mismatch.");
  if (mode === "production" && (process.env.MIGRATION_FROM === "none") !== (process.env.MIGRATION_TO === "none")) throw new Error("No-migrations range must use none/none.");
  if (mode === "rehearsal" && (process.env.MIGRATION_FROM === "none") !== (process.env.MIGRATION_TO === "none")) throw new Error("No-migrations range must use none/none.");
  if (mode === "rehearsal" && process.env.GITHUB_REF_PROTECTED !== "true") throw new Error("Rehearsal requires a protected ref.");
  if (mode === "rehearsal" && (
    process.env.DATABASE_ID === process.env.RECOVERY_DATABASE_ID ||
    process.env.DATABASE_NAME === process.env.RECOVERY_DATABASE_NAME
  )) throw new Error("Recovery rehearsal requires a distinct database name and ID.");
  console.log(`Validated inert ${mode} workflow inputs.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
