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
  requiredIndexes?: ByTable<readonly RequiredIndex[]>,
  actualIndexesByTable?: ByTable<ByTable<ActualIndex>>,
  requiredColumnConstraints?: ByTable<ByTable<RequiredColumnConstraints>>,
  actualColumnConstraintsByTable?: ByTable<ByTable<ActualColumnConstraints>>,
  requiredForeignKeys?: ByTable<readonly RequiredForeignKey[]>,
  actualForeignKeysByTable?: ByTable<readonly ActualForeignKey[]>,
): D1SchemaDiff;
export function normalizeSqlFormatting(value: unknown): string;
export function diffD1Triggers(
  requiredTriggers: readonly RequiredTrigger[],
  actualTriggersByName: Readonly<Record<string, ActualTrigger>>,
): D1TriggerDiff;
export function hasSchemaDrift(diff: D1Drift): boolean;
export function formatSchemaDrift(diff: D1Drift, databaseName: string): string;
