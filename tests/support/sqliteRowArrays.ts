import type { SQLInputValue, StatementSync } from 'node:sqlite';
import { z } from 'zod';

const rowsOfColumnValues = z.array(z.array(z.unknown()));

export function allRowsAsArrays(statement: StatementSync, values: SQLInputValue[]): unknown[][] {
  statement.setReturnArrays(true);
  return rowsOfColumnValues.parse(statement.all(...values));
}
