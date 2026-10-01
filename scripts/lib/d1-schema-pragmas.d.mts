import type { ActualColumnConstraints, ActualForeignKey, ActualIndex, ActualTrigger } from "./d1-schema-drift.mjs";

export interface SchemaQueryResults {
  tableResults: unknown[];
  indexResults: unknown[];
  foreignKeyResults: unknown[];
  triggerResult: unknown;
}

export function buildSchemaQuery(tableNames: readonly string[]): string;
export function splitSchemaQueryResults(tableNames: readonly string[], wranglerResults: unknown): SchemaQueryResults;
export function mapPragmaResults(tableNames: readonly string[], wranglerResults: readonly unknown[]): Record<string, string[]>;
export function mapColumnConstraintPragmaResults(
  tableNames: readonly string[],
  wranglerResults: readonly unknown[],
): Record<string, Record<string, ActualColumnConstraints>>;
export function mapForeignKeyPragmaResults(
  tableNames: readonly string[],
  wranglerResults: readonly unknown[],
): Record<string, ActualForeignKey[]>;
export function mapIndexPragmaResults(
  tableNames: readonly string[],
  wranglerResults: readonly unknown[],
): Record<string, Record<string, ActualIndex>>;
export function mapTriggerResults(wranglerResult: unknown): Record<string, ActualTrigger>;
