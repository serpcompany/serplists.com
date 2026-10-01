import { normalizeSqlFormatting } from "./d1-schema-drift.mjs";

const TRIGGER_QUERY = "SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'trigger';";

export function buildSchemaQuery(tableNames) {
  const pragmas = (pragma) => tableNames.map((tableName) => `pragma ${pragma}('${tableName}');`);
  return [
    ...pragmas("table_info"),
    ...pragmas("index_list"),
    ...pragmas("foreign_key_list"),
    TRIGGER_QUERY,
  ].join(" ");
}

export function splitSchemaQueryResults(tableNames, wranglerResults) {
  const count = tableNames.length;
  const expected = count * 3 + 1;
  if (!Array.isArray(wranglerResults) || wranglerResults.length !== expected) {
    const actual = Array.isArray(wranglerResults) ? wranglerResults.length : "no";
    throw new Error(`Wrangler returned ${actual} result sets; expected ${expected} result sets.`);
  }

  return {
    tableResults: wranglerResults.slice(0, count),
    indexResults: wranglerResults.slice(count, count * 2),
    foreignKeyResults: wranglerResults.slice(count * 2, count * 3),
    triggerResult: wranglerResults[count * 3],
  };
}

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

export function mapTriggerResults(wranglerResult) {
  const rows = Array.isArray(wranglerResult?.results) ? wranglerResult.results : [];
  return Object.fromEntries(
    rows
      .filter((row) => typeof row?.name === "string")
      .map((row) => [
        row.name,
        {
          table: typeof row.tbl_name === "string" ? row.tbl_name : "",
          definition: normalizeSqlFormatting(row.sql),
        },
      ]),
  );
}
