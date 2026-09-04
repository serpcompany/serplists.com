function visibleIds(rows, ownerId) {
  if (!Array.isArray(rows)) return null;
  return new Set(rows.filter((row) => row?.user_id === ownerId).map((row) => String(row.id)));
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
  return {
    check: "authenticated-account-owned-postdeploy-smoke",
    databaseTemplateCount: input.databaseTemplateIds.length,
    databaseRunCount: input.databaseRunIds.length,
    apiTemplateCount: templateIds?.size ?? null,
    apiRunCount: runIds?.size ?? null,
    deploymentHealthStatus: input.deploymentHealthStatus,
    customDomainHealthStatus: input.customDomainHealthStatus,
    failures,
    verdict: failures.length ? "fail" : "pass",
  };
}
