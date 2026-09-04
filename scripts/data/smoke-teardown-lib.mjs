import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

function assertContained(candidate, root, label) {
  const resolved = path.resolve(candidate);
  const allowed = path.resolve(root);
  if (resolved !== allowed && !resolved.startsWith(`${allowed}${path.sep}`)) {
    throw new Error(`${label} must stay under ${allowed}.`);
  }
  return resolved;
}

export function cleanupSmokeState({
  repoRoot,
  statePath,
  transientPaths = [],
  reportPath,
  remove = (target) => rmSync(target, { recursive: true, force: true }),
}) {
  const resolvedState = assertContained(
    statePath,
    path.join(repoRoot, ".wrangler"),
    "Smoke state",
  );
  const resolvedReport = assertContained(
    reportPath,
    path.join(repoRoot, "tmp/data-reports"),
    "Smoke teardown report",
  );
  const resolvedTransientPaths = transientPaths.map((candidate) =>
    assertContained(candidate, path.join(repoRoot, ".wrangler"), "Smoke transient state"),
  );
  const existedBefore = existsSync(resolvedState);
  if (existedBefore) remove(resolvedState);
  for (const transientPath of resolvedTransientPaths) {
    if (existsSync(transientPath)) remove(transientPath);
  }
  const existsAfter = existsSync(resolvedState);
  const remainingTransientPaths = resolvedTransientPaths.filter(existsSync);
  const report = {
    check: "browser-smoke-teardown",
    stateIdentity: path.relative(repoRoot, resolvedState),
    existedBefore,
    existsAfter,
    transientIdentities: resolvedTransientPaths.map((candidate) => path.relative(repoRoot, candidate)),
    remainingTransientIdentities: remainingTransientPaths.map((candidate) => path.relative(repoRoot, candidate)),
    leakedStatePaths: (existsAfter ? 1 : 0) + remainingTransientPaths.length,
    verdict: existsAfter || remainingTransientPaths.length > 0 ? "fail" : "pass",
  };
  mkdirSync(path.dirname(resolvedReport), { recursive: true });
  writeFileSync(resolvedReport, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
