function visibleIds(rows, ownerId) {
  if (!Array.isArray(rows)) return null;
  return new Set(rows.filter((row) => row?.user_id === ownerId).map((row) => String(row.id)));
}
const REQUIRED_MUTATION_CHECKS = ["template_canary_designated", "template_write", "template_write_readback", "template_restore", "run_canary_designated", "run_write", "run_write_readback", "run_restore"];
export function validateControlledCanaryChecks(report) {
  const checks = new Map((report?.checks ?? []).map((check) => [check.name, check.verdict]));
  if (report?.controlledCanaryMutationApproved !== true || REQUIRED_MUTATION_CHECKS.some((name) => checks.get(name) !== "pass") || checks.size !== REQUIRED_MUTATION_CHECKS.length) throw new Error("Controlled canary write, readback, and restoration evidence is incomplete.");
  return report;
}

export async function exerciseControlledCanaryMutation({ template, run, request }) {
  const probeTitle = `${String(template.title)} [write probe]`;
  const originalProgress = Number(run.progress);
  const probeProgress = originalProgress === 42 ? 43 : 42;
  const evidence = {
    template: { id: String(template.id), originalTitle: String(template.title), originalVersion: Number(template.version), probeTitle, writeStatus: null, readbackTitle: null, readbackVersion: null, restoreStatus: null, restoredTitle: null },
    run: { id: String(run.id), originalProgress, originalRevision: Number(run.revision), probeProgress, writeStatus: null, readbackProgress: null, readbackRevision: null, restoreStatus: null, restoredProgress: null },
  };
  try {
    const templateWrite = await request(`/api/templates/${evidence.template.id}`, { method: "PUT", body: JSON.stringify({ title: probeTitle, expected_version: evidence.template.originalVersion }) });
    evidence.template.writeStatus = templateWrite.status;
    const templateReadback = await request(`/api/templates/${evidence.template.id}`);
    evidence.template.readbackTitle = templateReadback.rows?.title ?? null;
    evidence.template.readbackVersion = Number(templateReadback.rows?.version);
    const runWrite = await request(`/api/checklists/${evidence.run.id}`, { method: "PUT", body: JSON.stringify({ progress: probeProgress, expected_revision: evidence.run.originalRevision }) });
    evidence.run.writeStatus = runWrite.status;
    const runReadback = await request(`/api/checklists/${evidence.run.id}`);
    evidence.run.readbackProgress = Number(runReadback.rows?.progress);
    evidence.run.readbackRevision = Number(runReadback.rows?.revision);
  } catch (error) {
    evidence.error = error instanceof Error ? error.message : String(error);
  } finally {
    if (evidence.template.writeStatus >= 200 && evidence.template.writeStatus < 300) {
      try {
        const restore = await request(`/api/templates/${evidence.template.id}`, { method: "PUT", body: JSON.stringify({ title: evidence.template.originalTitle, expected_version: typeof evidence.template.readbackVersion === "number" && Number.isFinite(evidence.template.readbackVersion) ? evidence.template.readbackVersion : evidence.template.originalVersion + 1 }) });
        evidence.template.restoreStatus = restore.status;
        evidence.template.restoredTitle = (await request(`/api/templates/${evidence.template.id}`)).rows?.title ?? null;
      } catch (error) { evidence.template.restoreError = error instanceof Error ? error.message : String(error); }
    }
    if (evidence.run.writeStatus >= 200 && evidence.run.writeStatus < 300) {
      try {
        const restore = await request(`/api/checklists/${evidence.run.id}`, { method: "PUT", body: JSON.stringify({ progress: evidence.run.originalProgress, expected_revision: typeof evidence.run.readbackRevision === "number" && Number.isFinite(evidence.run.readbackRevision) ? evidence.run.readbackRevision : evidence.run.originalRevision + 1 }) });
        evidence.run.restoreStatus = restore.status;
        evidence.run.restoredProgress = Number((await request(`/api/checklists/${evidence.run.id}`)).rows?.progress);
      } catch (error) { evidence.run.restoreError = error instanceof Error ? error.message : String(error); }
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
    ["template_write_readback", input.canaryMutation?.template?.readbackTitle === input.canaryMutation?.template?.probeTitle && input.canaryMutation?.template?.readbackVersion > input.canaryMutation?.template?.originalVersion],
    ["template_restore", input.canaryMutation?.template?.restoreStatus >= 200 && input.canaryMutation?.template?.restoreStatus < 300 && input.canaryMutation?.template?.restoredTitle === input.canaryMutation?.template?.originalTitle],
    ["run_canary_designated", input.canaryMutation?.run?.id === input.designatedRunId],
    ["run_write", input.canaryMutation?.run?.writeStatus >= 200 && input.canaryMutation?.run?.writeStatus < 300],
    ["run_write_readback", input.canaryMutation?.run?.readbackProgress === input.canaryMutation?.run?.probeProgress && input.canaryMutation?.run?.readbackRevision > input.canaryMutation?.run?.originalRevision],
    ["run_restore", input.canaryMutation?.run?.restoreStatus >= 200 && input.canaryMutation?.run?.restoreStatus < 300 && input.canaryMutation?.run?.restoredProgress === input.canaryMutation?.run?.originalProgress],
  ].map(([name, passed]) => ({ name, verdict: passed ? "pass" : "fail" }));
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
    canaryMutation: input.canaryMutation,
    checks: mutationChecks,
    failures,
    verdict: failures.length ? "fail" : "pass",
  };
}
