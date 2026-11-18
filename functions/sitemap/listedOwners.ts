import { and, isNull, sql } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';

import { teams, users } from '../../db/schema/index';

const validHandleCondition = (column: SQLiteColumn) => sql<boolean>`
  length(trim(${column})) between 3 and 30
  and trim(${column}) not glob ${'*[^A-Za-z0-9_.-]*'}`;

const trimmedHandle = (column: SQLiteColumn) => sql<string>`trim(${column})`;

export const validUsernameCondition = validHandleCondition(users.username);

export const listedUsername = trimmedHandle(users.username);

export const validOrganizationHandleCondition = validHandleCondition(teams.slug);

export const listedOrganizationHandle = trimmedHandle(teams.slug);

export const listedOrganizationCondition = and(isNull(teams.archived_at), validOrganizationHandleCondition);
