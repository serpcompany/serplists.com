import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function writeDataCheckReports({ name, report, summary, reportDirectory = "tmp/data-reports" }) {
  mkdirSync(reportDirectory, { recursive: true });
  const failed = report.verdict !== "pass";
  const junit = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="${escapeXml(name)}" tests="1" failures="${failed ? 1 : 0}">`,
    `  <testcase classname="data-safety" name="${escapeXml(name)}">`,
    ...(failed ? [`    <failure message="${escapeXml(summary.split("\n")[0])}">${escapeXml(summary)}</failure>`] : []),
    "  </testcase>",
    "</testsuite>",
    "",
  ].join("\n");

  const paths = {
    json: join(reportDirectory, `${name}.json`),
    junit: join(reportDirectory, `${name}.junit.xml`),
    text: join(reportDirectory, `${name}.txt`),
  };
  writeFileSync(paths.json, JSON.stringify(report, null, 2) + "\n");
  writeFileSync(paths.junit, junit);
  writeFileSync(paths.text, summary + "\n");
  return paths;
}

export function buildFailureReport({
  check,
  commit = "unknown",
  error,
  migrationFiles = [],
  requestedTarget,
  resolvedIdentity = null,
}) {
  return {
    check,
    commit,
    requestedTarget,
    resolvedIdentity,
    target: {
      ...requestedTarget,
      databaseId: resolvedIdentity?.databaseId ?? null,
    },
    migrationRange: migrationFiles.length
      ? { from: migrationFiles[0], to: migrationFiles.at(-1) }
      : { from: null, to: null },
    error: error instanceof Error ? error.message : String(error),
    verdict: "fail",
  };
}
