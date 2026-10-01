import type {
  ByTable,
  RequiredColumnConstraints,
  RequiredForeignKey,
  RequiredIndex,
  RequiredTrigger,
} from "./lib/d1-schema-drift.mjs";

export const REQUIRED_D1_SCHEMA: ByTable<readonly string[]>;
export const REQUIRED_D1_COLUMN_CONSTRAINTS: ByTable<ByTable<Readonly<RequiredColumnConstraints>>>;
export const REQUIRED_D1_FOREIGN_KEYS: ByTable<readonly Readonly<RequiredForeignKey>[]>;
export const REQUIRED_D1_INDEXES: ByTable<readonly Readonly<RequiredIndex>[]>;
export const REQUIRED_D1_TRIGGERS: readonly Readonly<RequiredTrigger>[];

export {
  buildSchemaQuery,
  mapColumnConstraintPragmaResults,
  mapForeignKeyPragmaResults,
  mapIndexPragmaResults,
  mapPragmaResults,
  mapTriggerResults,
  splitSchemaQueryResults,
} from "./lib/d1-schema-pragmas.mjs";
export type { SchemaQueryResults } from "./lib/d1-schema-pragmas.mjs";
export {
  diffD1Schema,
  diffD1Triggers,
  formatSchemaDrift,
  hasSchemaDrift,
  normalizeSqlFormatting,
} from "./lib/d1-schema-drift.mjs";
export type {
  ActualColumnConstraints,
  ActualForeignKey,
  ActualIndex,
  ActualTrigger,
  ByTable,
  D1Drift,
  D1SchemaDiff,
  D1TriggerDiff,
  DriftIssue,
  RequiredColumnConstraints,
  RequiredForeignKey,
  RequiredIndex,
  RequiredTrigger,
} from "./lib/d1-schema-drift.mjs";
