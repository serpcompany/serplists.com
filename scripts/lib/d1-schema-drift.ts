export type RequiredIndex = { name: string; unique?: boolean; partial?: boolean };
export type ActualIndex = { unique: boolean; partial: boolean };
export type RequiredColumnConstraints = { notNull?: boolean; primaryKey?: boolean };
export type ActualColumnConstraints = { notNull: boolean; primaryKey: boolean };
export type RequiredForeignKey = { from: string; table: string; to: string; onDelete?: string };
export type ActualForeignKey = { from: string; table: string; to: string; onDelete: string };
export type RequiredTrigger = { name: string; table: string; definition: string };
export type ActualTrigger = { table: string; definition: string };
export type DriftIssue = { name: string; issues: string[] };

export type ByTable<T> = Readonly<Record<string, T>>;

export interface D1SchemaDiff {
  missingTables: string[];
  missingColumns: Record<string, string[]>;
  missingIndexes: Record<string, string[]>;
  invalidIndexes: Record<string, DriftIssue[]>;
  invalidColumns: Record<string, DriftIssue[]>;
  missingForeignKeys: Record<string, string[]>;
  invalidForeignKeys: Record<string, DriftIssue[]>;
}

export interface D1TriggerDiff {
  missingTriggers: string[];
  invalidTriggers: DriftIssue[];
}

export type D1Drift = D1SchemaDiff & Partial<D1TriggerDiff>;

export function diffD1Schema(
  requiredSchema: ByTable<readonly string[]>,
  actualSchemaByTable: ByTable<readonly string[]>,
  requiredIndexes: ByTable<readonly RequiredIndex[]> = {},
  actualIndexesByTable: ByTable<ByTable<ActualIndex>> = {},
  requiredColumnConstraints: ByTable<ByTable<RequiredColumnConstraints>> = {},
  actualColumnConstraintsByTable: ByTable<ByTable<ActualColumnConstraints>> = {},
  requiredForeignKeys: ByTable<readonly RequiredForeignKey[]> = {},
  actualForeignKeysByTable: ByTable<readonly ActualForeignKey[]> = {},
): D1SchemaDiff {
  const missingTables: string[] = [];
  const missingColumns: Record<string, string[]> = {};
  const missingIndexes: Record<string, string[]> = {};
  const invalidIndexes: Record<string, DriftIssue[]> = {};
  const invalidColumns: Record<string, DriftIssue[]> = {};
  const missingForeignKeys: Record<string, string[]> = {};
  const invalidForeignKeys: Record<string, DriftIssue[]> = {};

  for (const [tableName, requiredColumns] of Object.entries(requiredSchema)) {
    const actualColumns = actualSchemaByTable[tableName] ?? [];

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
    const missingForTable: string[] = [];
    const invalidForTable: DriftIssue[] = [];

    for (const requiredIndex of requiredTableIndexes) {
      const actualIndex = actualTableIndexes[requiredIndex.name];
      if (!actualIndex) {
        missingForTable.push(requiredIndex.name);
        continue;
      }

      const issues: string[] = [];
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
    const invalidForTable: DriftIssue[] = [];
    for (const [columnName, requiredConstraints] of Object.entries(requiredTableColumns)) {
      const actualColumn = actualTableColumns[columnName];
      if (!actualColumn) continue;

      const issues: string[] = [];
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
    const missingForTable: string[] = [];
    const invalidForTable: DriftIssue[] = [];
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

      const issues: string[] = [];
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

export function normalizeSqlFormatting(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replaceAll("`", "")
    .replaceAll('"', "")
    .replace(/\s+/g, " ");
}

export function diffD1Triggers(
  requiredTriggers: readonly RequiredTrigger[],
  actualTriggersByName: Readonly<Record<string, ActualTrigger>>,
): D1TriggerDiff {
  const missingTriggers: string[] = [];
  const invalidTriggers: DriftIssue[] = [];

  for (const requiredTrigger of requiredTriggers) {
    const actualTrigger = actualTriggersByName[requiredTrigger.name];
    if (!actualTrigger) {
      missingTriggers.push(requiredTrigger.name);
      continue;
    }

    const issues: string[] = [];
    if (actualTrigger.table !== requiredTrigger.table) {
      issues.push(`expected on ${requiredTrigger.table}, found on ${actualTrigger.table || "no table"}`);
    }
    if (actualTrigger.definition !== normalizeSqlFormatting(requiredTrigger.definition)) {
      issues.push("definition differs from db/sql-only-schema.json");
    }
    if (issues.length > 0) invalidTriggers.push({ name: requiredTrigger.name, issues });
  }

  return { missingTriggers, invalidTriggers };
}

export function hasSchemaDrift(diff: D1Drift): boolean {
  const hasEntries = (value: readonly unknown[] | Readonly<Record<string, unknown>> | undefined) =>
    Array.isArray(value) ? value.length > 0 : Object.keys(value ?? {}).length > 0;
  return [
    diff.missingTables,
    diff.missingColumns,
    diff.missingIndexes,
    diff.invalidIndexes,
    diff.invalidColumns,
    diff.missingForeignKeys,
    diff.invalidForeignKeys,
    diff.missingTriggers,
    diff.invalidTriggers,
  ].some(hasEntries);
}

export function formatSchemaDrift(diff: D1Drift, databaseName: string): string {
  const lines = [`D1 schema drift detected for ${databaseName}.`];

  for (const tableName of diff.missingTables) {
    lines.push(`- missing table: ${tableName}`);
  }

  for (const [tableName, missingColumns] of Object.entries(diff.missingColumns)) {
    lines.push(`- ${tableName}: missing columns ${missingColumns.join(", ")}`);
  }

  for (const [tableName, missingIndexes] of Object.entries(diff.missingIndexes)) {
    lines.push(`- ${tableName}: missing indexes ${missingIndexes.join(", ")}`);
  }

  for (const [tableName, invalidIndexes] of Object.entries(diff.invalidIndexes)) {
    for (const invalidIndex of invalidIndexes) {
      lines.push(`- ${tableName}: invalid index ${invalidIndex.name} (${invalidIndex.issues.join("; ")})`);
    }
  }

  for (const [tableName, invalidColumns] of Object.entries(diff.invalidColumns)) {
    for (const invalidColumn of invalidColumns) {
      lines.push(`- ${tableName}: invalid column ${invalidColumn.name} (${invalidColumn.issues.join("; ")})`);
    }
  }

  for (const [tableName, missingForeignKeys] of Object.entries(diff.missingForeignKeys)) {
    lines.push(`- ${tableName}: missing foreign keys ${missingForeignKeys.join(", ")}`);
  }

  for (const [tableName, invalidForeignKeys] of Object.entries(diff.invalidForeignKeys)) {
    for (const invalidForeignKey of invalidForeignKeys) {
      lines.push(`- ${tableName}: invalid foreign key ${invalidForeignKey.name} (${invalidForeignKey.issues.join("; ")})`);
    }
  }

  for (const triggerName of diff.missingTriggers ?? []) {
    lines.push(`- missing trigger: ${triggerName}`);
  }

  for (const invalidTrigger of diff.invalidTriggers ?? []) {
    lines.push(`- invalid trigger ${invalidTrigger.name} (${invalidTrigger.issues.join("; ")})`);
  }

  lines.push("Apply the required checked-in D1 migrations before deploying.");

  return lines.join("\n");
}
