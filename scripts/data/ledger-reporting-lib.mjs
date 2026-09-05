import { createHash } from "node:crypto";

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

// This is a report projection only. Callers must continue to validate the
// original ordered ledger; this helper deliberately does not turn drift into a
// valid ledger. Unknown values influence count/digest/status but are never
// copied into an artifact or console summary.
export function privacySafeLedgerProjection({ repositoryMigrations, observedMigrations }) {
  const repository = Array.isArray(repositoryMigrations) ? repositoryMigrations : [];
  const observed = Array.isArray(observedMigrations) ? observedMigrations : [];
  const knownSet = new Set(repository);
  const knownMigrations = observed.filter((name) => typeof name === "string" && knownSet.has(name));
  const unknownCount = observed.length - knownMigrations.length;
  return {
    status: unknownCount === 0 ? "known" : "drift",
    observedCount: observed.length,
    knownCount: knownMigrations.length,
    unknownCount,
    observedSha256: sha256(observed),
    knownMigrations,
    appliedThrough: knownMigrations.at(-1) ?? null,
  };
}

export function assertRepositoryKnownLedger({ repositoryMigrations, observedMigrations }) {
  const projection = privacySafeLedgerProjection({ repositoryMigrations, observedMigrations });
  if (projection.status !== "known") {
    throw new Error("Applied migration ledger contains entries outside the repository history.");
  }
  return observedMigrations;
}
