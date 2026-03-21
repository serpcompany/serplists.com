export const REQUIRED_D1_SCHEMA = Object.freeze({
  users: [
    "id",
    "email",
    "password_hash",
    "name",
    "avatar_url",
    "username",
    "display_username",
    "email_verified",
    "auth_created_at",
    "auth_updated_at",
    "affiliate_code",
    "referral_count",
    "total_earnings",
    "created_at",
    "updated_at",
  ],
  account: [
    "id",
    "account_id",
    "provider_id",
    "user_id",
    "access_token",
    "refresh_token",
    "id_token",
    "access_token_expires_at",
    "refresh_token_expires_at",
    "scope",
    "password",
    "created_at",
    "updated_at",
  ],
  session: [
    "id",
    "expires_at",
    "token",
    "created_at",
    "updated_at",
    "ip_address",
    "user_agent",
    "user_id",
  ],
  verification: [
    "id",
    "identifier",
    "value",
    "expires_at",
    "created_at",
    "updated_at",
  ],
  templates: [
    "id",
    "user_id",
    "title",
    "description",
    "items",
    "version",
    "type",
    "is_public",
    "category",
    "tags",
    "slug",
    "created_at",
    "updated_at",
  ],
  checklist_runs: [
    "id",
    "user_id",
    "template_id",
    "title",
    "items",
    "status",
    "started_at",
    "completed_at",
    "is_public",
    "share_token",
    "share_expires_at",
    "share_used_at",
    "created_at",
    "updated_at",
    "progress",
  ],
  template_likes: [
    "user_id",
    "template_id",
    "created_at",
  ],
  usage_analytics: [
    "id",
    "user_id",
    "action",
    "resource_id",
    "metadata",
    "created_at",
  ],
  stripe_customers: [
    "user_id",
    "stripe_customer_id",
    "created_at",
    "updated_at",
  ],
  stripe_subscriptions: [
    "stripe_subscription_id",
    "user_id",
    "stripe_customer_id",
    "price_id",
    "status",
    "current_period_end",
    "cancel_at_period_end",
    "canceled_at",
    "trial_end",
    "created_at",
    "updated_at",
  ],
  stripe_webhook_events: [
    "id",
    "type",
    "created",
    "livemode",
    "processed_at",
    "error",
  ],
  entitlement_overrides: [
    "user_id",
    "plan",
    "expires_at",
    "note",
    "created_at",
    "updated_at",
  ],
});

export function mapPragmaResults(tableNames, wranglerResults) {
  return Object.fromEntries(
    tableNames.map((tableName, index) => {
      const rows = Array.isArray(wranglerResults[index]?.results) ? wranglerResults[index].results : [];
      const columns = rows
        .map((row) => (typeof row?.name === "string" ? row.name : null))
        .filter(Boolean)
        .sort();

      return [tableName, columns];
    }),
  );
}

export function diffD1Schema(requiredSchema, actualSchemaByTable) {
  const missingTables = [];
  const missingColumns = {};

  for (const [tableName, requiredColumns] of Object.entries(requiredSchema)) {
    const actualColumns = Array.isArray(actualSchemaByTable[tableName]) ? actualSchemaByTable[tableName] : [];

    if (actualColumns.length === 0) {
      missingTables.push(tableName);
      continue;
    }

    const actualColumnSet = new Set(actualColumns);
    const missingForTable = requiredColumns.filter((columnName) => !actualColumnSet.has(columnName));
    if (missingForTable.length > 0) {
      missingColumns[tableName] = missingForTable;
    }
  }

  return {
    missingTables,
    missingColumns,
  };
}

export function formatSchemaDrift(diff, databaseName) {
  const lines = [`Production D1 schema drift detected for ${databaseName}.`];

  for (const tableName of diff.missingTables) {
    lines.push(`- missing table: ${tableName}`);
  }

  for (const [tableName, missingColumns] of Object.entries(diff.missingColumns)) {
    lines.push(`- ${tableName}: missing columns ${missingColumns.join(", ")}`);
  }

  lines.push("Apply the required checked-in D1 migrations before deploying.");

  return lines.join("\n");
}
