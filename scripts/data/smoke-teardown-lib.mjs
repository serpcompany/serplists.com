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
  const existedBefore = existsSync(resolvedState);
  if (existedBefore) remove(resolvedState);
  const existsAfter = existsSync(resolvedState);
  const report = {
    check: "browser-smoke-teardown",
    stateIdentity: path.relative(repoRoot, resolvedState),
    existedBefore,
    existsAfter,
    leakedStatePaths: existsAfter ? 1 : 0,
    verdict: existsAfter ? "fail" : "pass",
  };
  mkdirSync(path.dirname(resolvedReport), { recursive: true });
  writeFileSync(resolvedReport, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
