import { z } from "zod";
import {
  type ActualColumnConstraints,
  type ActualForeignKey,
  type ActualIndex,
  type ActualTrigger,
  normalizeSqlFormatting,
} from "./d1-schema-drift";

export interface SchemaQueryResults {
  tableResults: unknown[];
  indexResults: unknown[];
  foreignKeyResults: unknown[];
  triggerResult: unknown;
}

const TRIGGER_QUERY = "SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'trigger';";

const resultSetSchema = z.object({ results: z.array(z.unknown()) });
const namedRowSchema = z.object({ name: z.string() });
const columnRowSchema = z.object({ name: z.string(), notnull: z.unknown(), pk: z.unknown() });
const foreignKeyRowSchema = z.object({ from: z.string(), table: z.string(), to: z.unknown(), on_delete: z.unknown() });
const indexRowSchema = z.object({ name: z.string(), unique: z.unknown(), partial: z.unknown() });
const triggerRowSchema = z.object({ name: z.string(), tbl_name: z.unknown(), sql: z.unknown() });

function rowsMatching<Row>(resultSet: unknown, rowSchema: z.ZodType<Row>): Row[] {
  const parsed = resultSetSchema.safeParse(resultSet);
  if (!parsed.success) return [];
  return parsed.data.results.flatMap((row) => {
    const matching = rowSchema.safeParse(row);
    return matching.success ? [matching.data] : [];
  });
}

export function buildSchemaQuery(tableNames: readonly string[]): string {
  const pragmas = (pragma: string) => tableNames.map((tableName) => `pragma ${pragma}('${tableName}');`);
  return [
    ...pragmas("table_info"),
    ...pragmas("index_list"),
    ...pragmas("foreign_key_list"),
    TRIGGER_QUERY,
  ].join(" ");
}

export function splitSchemaQueryResults(tableNames: readonly string[], wranglerResults: unknown): SchemaQueryResults {
  const count = tableNames.length;
  const expected = count * 3 + 1;
  const resultSets = z.array(z.unknown()).safeParse(wranglerResults);
  if (!resultSets.success || resultSets.data.length !== expected) {
    const actual = resultSets.success ? resultSets.data.length : "no";
    throw new Error(`Wrangler returned ${actual} result sets; expected ${expected} result sets.`);
  }

  return {
    tableResults: resultSets.data.slice(0, count),
    indexResults: resultSets.data.slice(count, count * 2),
    foreignKeyResults: resultSets.data.slice(count * 2, count * 3),
    triggerResult: resultSets.data[count * 3],
  };
}

export function mapPragmaResults(tableNames: readonly string[], wranglerResults: readonly unknown[]): Record<string, string[]> {
  return Object.fromEntries(
    tableNames.map((tableName, index) => {
      const columns = rowsMatching(wranglerResults[index], namedRowSchema)
        .map((row) => row.name)
        .filter(Boolean)
        .sort();

      return [tableName, columns];
    }),
  );
}

export function mapColumnConstraintPragmaResults(
  tableNames: readonly string[],
  wranglerResults: readonly unknown[],
): Record<string, Record<string, ActualColumnConstraints>> {
  return Object.fromEntries(
    tableNames.map((tableName, index) => {
      const columns = Object.fromEntries(
        rowsMatching(wranglerResults[index], columnRowSchema).map((row) => [
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

export function mapForeignKeyPragmaResults(
  tableNames: readonly string[],
  wranglerResults: readonly unknown[],
): Record<string, ActualForeignKey[]> {
  return Object.fromEntries(
    tableNames.map((tableName, index) => {
      const foreignKeys = rowsMatching(wranglerResults[index], foreignKeyRowSchema).map((row) => ({
        from: row.from,
        table: row.table,
        to: typeof row.to === "string" ? row.to : "",
        onDelete: typeof row.on_delete === "string" ? row.on_delete.toUpperCase() : "",
      }));

      return [tableName, foreignKeys];
    }),
  );
}

function toBooleanPragmaValue(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

export function mapIndexPragmaResults(
  tableNames: readonly string[],
  wranglerResults: readonly unknown[],
): Record<string, Record<string, ActualIndex>> {
  return Object.fromEntries(
    tableNames.map((tableName, index) => {
      const indexes = Object.fromEntries(
        rowsMatching(wranglerResults[index], indexRowSchema).map((row) => [
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

export function mapTriggerResults(wranglerResult: unknown): Record<string, ActualTrigger> {
  return Object.fromEntries(
    rowsMatching(wranglerResult, triggerRowSchema).map((row) => [
      row.name,
      {
        table: typeof row.tbl_name === "string" ? row.tbl_name : "",
        definition: normalizeSqlFormatting(row.sql),
      },
    ]),
  );
}
