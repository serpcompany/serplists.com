const successful = status => Number.isInteger(status) && status >= 200 && status < 300;
function visibleIds(rows, ownerId) {
  if (!Array.isArray(rows)) return null;
  return new Set(rows.filter((row) => row?.user_id === ownerId).map((row) => String(row.id)));
}
const REQUIRED_MUTATION_CHECKS = ["template_canary_designated", "template_write", "template_write_readback", "template_restore", "run_canary_designated", "run_write", "run_write_readback", "run_restore"];
export function validateControlledCanaryChecks(report) {
  const claims = Array.isArray(report?.checks) ? report.checks : [];
  const checks = new Map(claims.map((check) => [check.name, check.verdict]));
  if ("canaryMutation" in (report ?? {}) || !/^[0-9a-f]{64}$/.test(report?.canaryEvidenceDigest ?? "")) throw new Error("Controlled canary evidence is privacy-unsafe or missing its keyed digest.");
  if (report?.controlledCanaryMutationApproved !== true || claims.length !== REQUIRED_MUTATION_CHECKS.length || REQUIRED_MUTATION_CHECKS.some((name) => checks.get(name) !== "pass") || checks.size !== REQUIRED_MUTATION_CHECKS.length) throw new Error("Controlled canary write, readback, and restoration evidence is incomplete.");
  return report;
}

export async function exerciseControlledCanaryMutation({ template, run, request }) {
  const probeTitle = `${String(template.title)} [write probe]`;
  const originalProgress = Number(run.progress);
  const probeProgress = originalProgress === 42 ? 43 : 42;
  const evidence = {
    template: { id: String(template.id), originalTitle: String(template.title), originalVersion: Number(template.version), probeTitle, writeAttempted: false, writeStatus: null, readbackTitle: null, readbackVersion: null, restoreStatus: null, restoredTitle: null },
    run: { id: String(run.id), originalProgress, originalRevision: Number(run.revision), probeProgress, writeAttempted: false, writeStatus: null, readbackProgress: null, readbackRevision: null, restoreStatus: null, restoredProgress: null },
  };
  const probes = [
    { key: "template", path: `/api/templates/${evidence.template.id}`, field: "title", version: "version", expected: "expected_version", original: "originalTitle", probe: "probeTitle", before: "originalVersion", read: "readbackTitle", revision: "readbackVersion", restored: "restoredTitle" },
    { key: "run", path: `/api/checklists/${evidence.run.id}`, field: "progress", version: "revision", expected: "expected_revision", original: "originalProgress", probe: "probeProgress", before: "originalRevision", read: "readbackProgress", revision: "readbackRevision", restored: "restoredProgress" },
  ];
  try {
    if (typeof template.title !== "string" || !template.id || !run.id || !Number.isSafeInteger(template.version) || template.version < 0 || !Number.isSafeInteger(run.revision) || run.revision < 0 || typeof run.progress !== "number" || !Number.isFinite(run.progress)) throw new Error();
    for (const p of probes) {
      const e = evidence[p.key];
      e.writeAttempted = true;
      const write = await request(p.path, { method: "PUT", body: JSON.stringify({ [p.field]: e[p.probe], [p.expected]: e[p.before] }) });
      e.writeStatus = write.status;
      if (!successful(write.status)) throw new Error();
      const readback = await request(p.path);
      e.readbackStatus = readback.status;
      e[p.read] = readback.rows?.[p.field] ?? null;
      e[p.revision] = readback.rows?.[p.version] ?? null;
      if (readback.status !== 200 || e[p.read] !== e[p.probe] || e[p.revision] !== e[p.before] + 1) throw new Error();
    }
  } catch {
    evidence.error = "Canary probe failed.";
  } finally {
    for (const p of probes) {
      const e = evidence[p.key];
      if (!e.writeAttempted) continue;
      try {
        const current = await request(p.path);
        if (current.status !== 200) throw new Error();
        const version = current.rows?.[p.version];
        let restoredVersion = e[p.before];
        if (current.rows?.[p.field] === e[p.original] && version === e[p.before]) {
          e.restoreStatus = 200;
        } else if (current.rows?.[p.field] === e[p.probe] && version === e[p.before] + 1) {
          const restore = await request(p.path, { method: "PUT", body: JSON.stringify({ [p.field]: e[p.original], [p.expected]: version }) });
          e.restoreStatus = restore.status;
          if (!successful(restore.status)) throw new Error();
          restoredVersion = version + 1;
        } else throw new Error();
        const restored = await request(p.path);
        e.restoredStatus = restored.status;
        e[p.restored] = restored.rows?.[p.field] ?? null;
        e.restoredVersion = restored.rows?.[p.version] ?? null;
        e.expectedRestoredVersion = restoredVersion;
        if (restored.status !== 200 || e[p.restored] !== e[p.original] || e.restoredVersion !== restoredVersion) throw new Error();
      } catch { e.restoreError = "Canary restoration failed or state changed concurrently; restoration refused."; }
    }
  }
  return evidence;
}

export function evaluateDeploymentSmoke(input) {
  const templateIds = visibleIds(input.templateRows, input.ownerId);
  const runIds = visibleIds(input.runRows, input.ownerId);
  const failures = [];
  if (!input.databaseTemplateIds.length) failures.push("database_canary_templates_missing");
  if (!input.databaseRunIds.length) failures.push("database_canary_runs_missing");
  if (input.templateStatus < 200 || input.templateStatus >= 300 || !templateIds) failures.push("authenticated_template_api_error");
  if (input.runStatus < 200 || input.runStatus >= 300 || !runIds) failures.push("authenticated_run_api_error");
  if (templateIds && input.databaseTemplateIds.some((id) => !templateIds.has(String(id)))) failures.push("account_owned_templates_missing");
  if (runIds && input.databaseRunIds.some((id) => !runIds.has(String(id)))) failures.push("account_owned_runs_missing");
  if (input.deploymentHealthStatus < 200 || input.deploymentHealthStatus >= 300) failures.push("deployment_health_failed");
  if (input.customDomainHealthStatus < 200 || input.customDomainHealthStatus >= 300) failures.push("custom_domain_health_failed");
  if (input.controlledCanaryMutationApproved !== true) failures.push("controlled_canary_mutation_not_approved");
  const mutationChecks = [
    ["template_canary_designated", input.canaryMutation?.template?.id === input.designatedTemplateId],
    ["template_write", input.canaryMutation?.template?.writeStatus >= 200 && input.canaryMutation?.template?.writeStatus < 300],
    ["template_write_readback", input.canaryMutation?.template?.readbackTitle === input.canaryMutation?.template?.probeTitle && input.canaryMutation?.template?.readbackStatus === 200 && input.canaryMutation?.template?.readbackVersion === input.canaryMutation?.template?.originalVersion + 1],
    ["template_restore", !input.canaryMutation?.template?.restoreError && input.canaryMutation?.template?.restoredStatus === 200 && input.canaryMutation?.template?.restoredVersion === input.canaryMutation?.template?.expectedRestoredVersion && input.canaryMutation?.template?.restoreStatus >= 200 && input.canaryMutation?.template?.restoreStatus < 300 && input.canaryMutation?.template?.restoredTitle === input.canaryMutation?.template?.originalTitle],
    ["run_canary_designated", input.canaryMutation?.run?.id === input.designatedRunId],
    ["run_write", input.canaryMutation?.run?.writeStatus >= 200 && input.canaryMutation?.run?.writeStatus < 300],
    ["run_write_readback", input.canaryMutation?.run?.readbackProgress === input.canaryMutation?.run?.probeProgress && input.canaryMutation?.run?.readbackStatus === 200 && input.canaryMutation?.run?.readbackRevision === input.canaryMutation?.run?.originalRevision + 1],
    ["run_restore", !input.canaryMutation?.run?.restoreError && input.canaryMutation?.run?.restoredStatus === 200 && input.canaryMutation?.run?.restoredVersion === input.canaryMutation?.run?.expectedRestoredVersion && input.canaryMutation?.run?.restoreStatus >= 200 && input.canaryMutation?.run?.restoreStatus < 300 && input.canaryMutation?.run?.restoredProgress === input.canaryMutation?.run?.originalProgress],
  ].map(([name, passed]) => ({ name, verdict: passed ? "pass" : "fail" }));
  const evidenceChecks = [
    ['database_canary_templates_present', input.databaseTemplateIds.length > 0],
    ['database_canary_runs_present', input.databaseRunIds.length > 0],
    ['authenticated_template_api', input.templateStatus >= 200 && input.templateStatus < 300 && templateIds !== null],
    ['authenticated_run_api', input.runStatus >= 200 && input.runStatus < 300 && runIds !== null],
    ['account_owned_templates_visible', templateIds !== null && input.databaseTemplateIds.every(id => templateIds.has(String(id)))],
    ['account_owned_runs_visible', runIds !== null && input.databaseRunIds.every(id => runIds.has(String(id)))],
    ['deployment_health', input.deploymentHealthStatus >= 200 && input.deploymentHealthStatus < 300],
    ['custom_domain_health', input.customDomainHealthStatus >= 200 && input.customDomainHealthStatus < 300],
    ['controlled_canary_mutation_approval', input.controlledCanaryMutationApproved === true],
  ].map(([name, passed]) => ({ name, verdict: passed ? 'pass' : 'fail' }));
  if (input.canaryMutation?.error) failures.push("canary_probe_failed");
  failures.push(...mutationChecks.filter((check) => check.verdict === "fail").map((check) => check.name));
  return {
    check: "authenticated-account-owned-postdeploy-smoke",
    databaseTemplateCount: input.databaseTemplateIds.length,
    databaseRunCount: input.databaseRunIds.length,
    apiTemplateCount: templateIds?.size ?? null,
    apiRunCount: runIds?.size ?? null,
    deploymentHealthStatus: input.deploymentHealthStatus,
    customDomainHealthStatus: input.customDomainHealthStatus,
    controlledCanaryMutationApproved: input.controlledCanaryMutationApproved === true,
    canaryEvidenceDigest: input.canaryEvidenceDigest,
    checks: mutationChecks,
    evidenceChecks,
    failures,
    verdict: failures.length ? "fail" : "pass",
  };
}
