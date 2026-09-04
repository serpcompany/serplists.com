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
  const junitChecks = Array.isArray(report.checks) && report.checks.length > 0
    ? [...report.checks, ...(Array.isArray(report.evidenceChecks) ? report.evidenceChecks : [])]
    : [{ name, verdict: failed ? "fail" : "pass" }];
  const failureCount = junitChecks.filter((check) => check.verdict !== "pass").length;
  const reportProperties = [
    ["commit", report.commit], ["environment", report.target?.environment],
    ["database", report.target?.databaseName], ["databaseId", report.target?.databaseId],
    ["migrationFrom", report.migrationRange?.from], ["migrationTo", report.migrationRange?.to],
    ["sanitizer", report.sanitizerVersion ?? report.sanitizedSource?.sanitizerVersion],
  ].filter(([, value]) => value != null);
  const junit = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="${escapeXml(name)}" tests="${junitChecks.length}" failures="${failureCount}">`,
    ...(reportProperties.length ? ["  <properties>", ...reportProperties.map(([key, value]) => `    <property name="${escapeXml(key)}" value="${escapeXml(value)}"/>`), "  </properties>"] : []),
    ...junitChecks.flatMap((check) => [
      `  <testcase classname="data-safety" name="${escapeXml(check.name)}">`,
      ...(check.verdict !== "pass"
        ? [`    <failure message="${escapeXml(check.name)} failed">${escapeXml(summary)}</failure>`]
        : []),
      "  </testcase>",
    ]),
    "</testsuite>",
    "",
  ].join("\n");

  const paths = {
    json: join(reportDirectory, `${name}.json`),
    junit: join(reportDirectory, `${name}.junit.xml`),
    markdown: join(reportDirectory, `${name}.md`),
    text: join(reportDirectory, `${name}.txt`),
  };
  writeFileSync(paths.json, JSON.stringify(report, null, 2) + "\n");
  writeFileSync(paths.junit, junit);
  writeFileSync(paths.markdown, summary + "\n");
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
