const APP_D1_BINDING = "DB";

const isMissingOrPlaceholder = (databaseId) => !databaseId || databaseId.includes("<");

const appDatabase = (entries) => entries.find((entry) => entry.binding === APP_D1_BINDING);

export function findPreviewD1BindingProblem(d1) {
  const topLevel = appDatabase(d1.topLevel);
  const productionDatabaseId = topLevel?.database_id;
  const previewDatabaseId = topLevel?.preview_database_id;
  const previewDeploymentDatabaseId = appDatabase(d1.preview)?.database_id;

  if (!productionDatabaseId) {
    return "wrangler.toml is missing the production D1 database_id.";
  }
  if (isMissingOrPlaceholder(previewDatabaseId)) {
    return "wrangler.toml must set preview_database_id to the staging D1 UUID before preview/staging deploys.";
  }
  if (previewDatabaseId === productionDatabaseId) {
    return "preview_database_id must not match the production D1 database_id.";
  }
  if (isMissingOrPlaceholder(previewDeploymentDatabaseId)) {
    return "wrangler.toml must set [[env.preview.d1_databases]] database_id to the staging D1 UUID before preview/staging deploys.";
  }
  if (previewDeploymentDatabaseId !== previewDatabaseId) {
    return "[[env.preview.d1_databases]] database_id must match preview_database_id so Pages preview deploys use the staging D1 database.";
  }
  return null;
}
