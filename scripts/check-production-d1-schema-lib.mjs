export const REQUIRED_D1_SCHEMA = Object.freeze({
  sitemap_revisions: ["kind", "revised_at"],
  sitemap_profile_revisions: ["user_id", "revised_at"],
  sitemap_owner_revisions: ["user_id", "revised_at"],
  sitemap_category_revisions: ["category", "revised_at"],
  sitemap_shard_revisions: ["kind", "page", "content_hash", "revised_at"],
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
    "seo_title",
    "seo_description",
    "rules",
    "owner_type",
    "team_id",
    "created_by_user_id",
    "updated_by_user_id",
    "is_public",
    "category",
    "tags",
    "slug",
    "created_at",
    "updated_at",
    "deleted_at",
  ],
  checklist_runs: [
    "id",
    "user_id",
    "team_id",
    "template_id",
    "title",
    "items",
    "status",
    "started_at",
    "completed_at",
    "created_by_user_id",
    "assigned_to_user_id",
    "started_by_user_id",
    "completed_by_user_id",
    "is_public",
    "share_token",
    "share_expires_at",
    "share_used_at",
    "created_at",
    "updated_at",
    "deleted_at",
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
  teams: [
    "id",
    "name",
    "slug",
    "billing_owner_user_id",
    "created_by_user_id",
    "created_at",
    "updated_at",
    "archived_at",
  ],
  team_members: [
    "id",
    "team_id",
    "user_id",
    "role",
    "status",
    "invited_by_user_id",
    "joined_at",
    "created_at",
    "updated_at",
  ],
  team_invites: [
    "id",
    "team_id",
    "email",
    "role",
    "token_hash",
    "invited_by_user_id",
    "accepted_by_user_id",
    "expires_at",
    "accepted_at",
    "revoked_at",
    "created_at",
    "updated_at",
  ],
  team_entitlement_overrides: [
    "team_id",
    "plan",
    "expires_at",
    "note",
    "created_at",
    "updated_at",
  ],
  audit_events: [
    "id",
    "actor_user_id",
    "subject_type",
    "subject_id",
    "resource_type",
    "resource_id",
    "action",
    "before_json",
    "after_json",
    "diff_json",
    "metadata_json",
    "request_id",
    "ip_hash",
    "user_agent",
    "created_at",
  ],
  template_versions: [
    "id",
    "template_id",
    "version",
    "changed_by_user_id",
    "subject_type",
    "subject_id",
    "snapshot_json",
    "content_hash",
    "change_summary",
    "created_at",
  ],
  personal_run_keys: [
    "id",
    "user_id",
    "name",
    "key_prefix",
    "key_hash",
    "created_at",
    "last_used_at",
    "revoked_at",
    "permissions",
  ],
});

export const REQUIRED_D1_COLUMN_CONSTRAINTS = Object.freeze({
  personal_run_keys: {
    id: { notNull: true, primaryKey: true },
  },
});

export const REQUIRED_D1_FOREIGN_KEYS = Object.freeze({
  personal_run_keys: [
    { from: "user_id", table: "users", to: "id", onDelete: "CASCADE" },
  ],
});

export const REQUIRED_D1_INDEXES = Object.freeze({
  templates: [
    { name: "idx_templates_slug_unique", unique: true },
    { name: "idx_templates_public_created_at" },
    { name: "idx_templates_owner" },
    { name: "idx_templates_team_id" },
  ],
  checklist_runs: [
    { name: "idx_checklist_runs_team_id" },
    { name: "idx_checklist_runs_template_owner" },
  ],
  teams: [
    { name: "idx_teams_slug_unique", unique: true, partial: true },
    { name: "idx_teams_created_by_user_id" },
  ],
  team_members: [
    { name: "idx_team_members_team_user_unique", unique: true },
    { name: "idx_team_members_user_id" },
    { name: "idx_team_members_team_role" },
    { name: "idx_team_members_active_owner_unique", unique: true, partial: true },
  ],
  team_invites: [
    { name: "idx_team_invites_token_hash_unique", unique: true },
    { name: "idx_team_invites_team_email" },
    { name: "idx_team_invites_email" },
  ],
  audit_events: [
    { name: "idx_audit_events_subject" },
    { name: "idx_audit_events_resource" },
  ],
  template_versions: [
    { name: "idx_template_versions_template_version_unique", unique: true },
  ],
  personal_run_keys: [
    { name: "idx_personal_run_keys_user_id" },
    { name: "idx_personal_run_keys_key_hash_unique", unique: true },
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

export function mapColumnConstraintPragmaResults(tableNames, wranglerResults) {
  return Object.fromEntries(
    tableNames.map((tableName, index) => {
      const rows = Array.isArray(wranglerResults[index]?.results) ? wranglerResults[index].results : [];
      const columns = Object.fromEntries(
        rows
          .filter((row) => typeof row?.name === "string")
          .map((row) => [
            row.name,
            {
              notNull: toBooleanPragmaValue(row.notnull),
              primaryKey: Number(row.pk) > 0,
            },
          ]),
      );

      return [tableName, columns];
    }),
  );
}

export function mapForeignKeyPragmaResults(tableNames, wranglerResults) {
  return Object.fromEntries(
    tableNames.map((tableName, index) => {
      const rows = Array.isArray(wranglerResults[index]?.results) ? wranglerResults[index].results : [];
      const foreignKeys = rows
        .filter((row) => typeof row?.from === "string" && typeof row?.table === "string")
        .map((row) => ({
          from: row.from,
          table: row.table,
          to: typeof row.to === "string" ? row.to : "",
          onDelete: typeof row.on_delete === "string" ? row.on_delete.toUpperCase() : "",
        }));

      return [tableName, foreignKeys];
    }),
  );
}

function toBooleanPragmaValue(value) {
  return value === true || value === 1 || value === "1";
}

export function mapIndexPragmaResults(tableNames, wranglerResults) {
  return Object.fromEntries(
    tableNames.map((tableName, index) => {
      const rows = Array.isArray(wranglerResults[index]?.results) ? wranglerResults[index].results : [];
      const indexes = Object.fromEntries(
        rows
          .filter((row) => typeof row?.name === "string")
          .map((row) => [
            row.name,
            {
              unique: toBooleanPragmaValue(row.unique),
              partial: toBooleanPragmaValue(row.partial),
            },
          ]),
      );

      return [tableName, indexes];
    }),
  );
}

export function diffD1Schema(
  requiredSchema,
  actualSchemaByTable,
  requiredIndexes = {},
  actualIndexesByTable = {},
  requiredColumnConstraints = {},
  actualColumnConstraintsByTable = {},
  requiredForeignKeys = {},
  actualForeignKeysByTable = {},
) {
  const missingTables = [];
  const missingColumns = {};
  const missingIndexes = {};
  const invalidIndexes = {};
  const invalidColumns = {};
  const missingForeignKeys = {};
  const invalidForeignKeys = {};

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

  for (const [tableName, requiredTableIndexes] of Object.entries(requiredIndexes)) {
    if (missingTables.includes(tableName)) {
      continue;
    }

    const actualTableIndexes = actualIndexesByTable[tableName] ?? {};
    const missingForTable = [];
    const invalidForTable = [];

    for (const requiredIndex of requiredTableIndexes) {
      const actualIndex = actualTableIndexes[requiredIndex.name];
      if (!actualIndex) {
        missingForTable.push(requiredIndex.name);
        continue;
      }

      const issues = [];
      if (typeof requiredIndex.unique === "boolean" && actualIndex.unique !== requiredIndex.unique) {
        issues.push(requiredIndex.unique ? "expected unique" : "expected non-unique");
      }
      if (typeof requiredIndex.partial === "boolean" && actualIndex.partial !== requiredIndex.partial) {
        issues.push(requiredIndex.partial ? "expected partial" : "expected non-partial");
      }

      if (issues.length > 0) {
        invalidForTable.push({ name: requiredIndex.name, issues });
      }
    }

    if (missingForTable.length > 0) {
      missingIndexes[tableName] = missingForTable;
    }
    if (invalidForTable.length > 0) {
      invalidIndexes[tableName] = invalidForTable;
    }
  }

  for (const [tableName, requiredTableColumns] of Object.entries(requiredColumnConstraints)) {
    if (missingTables.includes(tableName)) continue;

    const actualTableColumns = actualColumnConstraintsByTable[tableName] ?? {};
    const invalidForTable = [];
    for (const [columnName, requiredConstraints] of Object.entries(requiredTableColumns)) {
      const actualColumn = actualTableColumns[columnName];
      if (!actualColumn) continue;

      const issues = [];
      if (requiredConstraints.notNull === true && actualColumn.notNull !== true) {
        issues.push("expected NOT NULL");
      }
      if (requiredConstraints.primaryKey === true && actualColumn.primaryKey !== true) {
        issues.push("expected primary key");
      }
      if (issues.length > 0) invalidForTable.push({ name: columnName, issues });
    }
    if (invalidForTable.length > 0) invalidColumns[tableName] = invalidForTable;
  }

  for (const [tableName, requiredTableForeignKeys] of Object.entries(requiredForeignKeys)) {
    if (missingTables.includes(tableName)) continue;

    const actualTableForeignKeys = actualForeignKeysByTable[tableName] ?? [];
    const missingForTable = [];
    const invalidForTable = [];
    for (const requiredForeignKey of requiredTableForeignKeys) {
      const actualForeignKey = actualTableForeignKeys.find((foreignKey) =>
        foreignKey.from === requiredForeignKey.from &&
        foreignKey.table === requiredForeignKey.table &&
        foreignKey.to === requiredForeignKey.to
      );
      const label = `${requiredForeignKey.from}->${requiredForeignKey.table}.${requiredForeignKey.to}`;
      if (!actualForeignKey) {
        missingForTable.push(label);
        continue;
      }

      const issues = [];
      if (
        typeof requiredForeignKey.onDelete === "string" &&
        actualForeignKey.onDelete !== requiredForeignKey.onDelete.toUpperCase()
      ) {
        issues.push(`expected ON DELETE ${requiredForeignKey.onDelete.toUpperCase()}`);
      }
      if (issues.length > 0) invalidForTable.push({ name: label, issues });
    }
    if (missingForTable.length > 0) missingForeignKeys[tableName] = missingForTable;
    if (invalidForTable.length > 0) invalidForeignKeys[tableName] = invalidForTable;
  }

  return {
    missingTables,
    missingColumns,
    missingIndexes,
    invalidIndexes,
    invalidColumns,
    missingForeignKeys,
    invalidForeignKeys,
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

  for (const [tableName, missingIndexes] of Object.entries(diff.missingIndexes ?? {})) {
    lines.push(`- ${tableName}: missing indexes ${missingIndexes.join(", ")}`);
  }

  for (const [tableName, invalidIndexes] of Object.entries(diff.invalidIndexes ?? {})) {
    for (const invalidIndex of invalidIndexes) {
      lines.push(`- ${tableName}: invalid index ${invalidIndex.name} (${invalidIndex.issues.join("; ")})`);
    }
  }


  for (const [tableName, invalidColumns] of Object.entries(diff.invalidColumns ?? {})) {
    for (const invalidColumn of invalidColumns) {
      lines.push(`- ${tableName}: invalid column ${invalidColumn.name} (${invalidColumn.issues.join("; ")})`);
    }
  }

  for (const [tableName, missingForeignKeys] of Object.entries(diff.missingForeignKeys ?? {})) {
    lines.push(`- ${tableName}: missing foreign keys ${missingForeignKeys.join(", ")}`);
  }

  for (const [tableName, invalidForeignKeys] of Object.entries(diff.invalidForeignKeys ?? {})) {
    for (const invalidForeignKey of invalidForeignKeys) {
      lines.push(`- ${tableName}: invalid foreign key ${invalidForeignKey.name} (${invalidForeignKey.issues.join("; ")})`);
    }
  }

  lines.push("Apply the required checked-in D1 migrations before deploying.");

  return lines.join("\n");
}
