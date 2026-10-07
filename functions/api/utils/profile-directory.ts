import { and, asc, count, desc, gt, isNotNull, lt, type SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';

import { createDb, schema } from '../db';
import type { Env } from '../types';
import { listedOrganizationCondition, validUsernameCondition } from '../../sitemap/listedOwners';
import { isPublicHandle } from '../../../src/lib/schemas/publicHandle';
import {
  PROFILE_DIRECTORY_PAGE_SIZE,
  type ProfileDirectoryCollection,
  type ProfileDirectoryPage,
  type ProfileDirectoryQuery,
} from '../../../src/lib/schemas/profileDirectory';
import { publicTemplatesOfProfileOwners } from './public-profile-owner';

type Db = ReturnType<typeof createDb>;

type DirectoryRow = { id: string | null; key: string | null; name: string | null; avatar_url: string | null };

type Listing = {
  ownerType: 'user' | 'team';
  sortKey: SQLiteColumn;
  eligible: SQL | undefined;
  select: (db: Db, where: SQL | undefined, order: SQL) => Promise<DirectoryRow[]>;
};

const { teams, templates, users } = schema;

const LISTINGS: Record<ProfileDirectoryCollection, Listing> = {
  people: {
    ownerType: 'user',
    sortKey: users.username,
    eligible: validUsernameCondition,
    select: (db, where, order) => db
      .select({ id: users.id, key: users.username, name: users.name, avatar_url: users.avatar_url })
      .from(users)
      .where(where)
      .orderBy(order)
      .limit(PROFILE_DIRECTORY_PAGE_SIZE + 1),
  },
  organizations: {
    ownerType: 'team',
    sortKey: teams.slug,
    eligible: listedOrganizationCondition,
    select: (db, where, order) => db
      .select({ id: teams.id, key: teams.slug, name: teams.name, avatar_url: teams.avatar_url })
      .from(teams)
      .where(where)
      .orderBy(order)
      .limit(PROFILE_DIRECTORY_PAGE_SIZE + 1),
  },
};

function cursorCondition(sortKey: SQLiteColumn, query: ProfileDirectoryQuery): SQL | undefined {
  if (query.after) return gt(sortKey, query.after);
  if (query.before) return lt(sortKey, query.before);
  return undefined;
}

function selectProfileDirectoryRows(db: Db, query: ProfileDirectoryQuery): Promise<DirectoryRow[]> {
  const listing = LISTINGS[query.collection];
  const where = and(isNotNull(listing.sortKey), cursorCondition(listing.sortKey, query), listing.eligible);
  return listing.select(db, where, query.before ? desc(listing.sortKey) : asc(listing.sortKey));
}

function countPublicTemplatesOf(db: Db, ownerType: 'user' | 'team', ownerIds: string[]) {
  const owner = ownerType === 'user' ? templates.user_id : templates.team_id;
  return db
    .select({ owner, total: count() })
    .from(templates)
    .where(publicTemplatesOfProfileOwners(ownerType, ownerIds))
    .groupBy(owner);
}

type ListedRow = DirectoryRow & { id: string; key: string };

const isListed = (row: DirectoryRow): row is ListedRow =>
  row.id !== null && row.key !== null && isPublicHandle(row.key.trim());

function pageOf(rows: ListedRow[], query: ProfileDirectoryQuery) {
  const hasMore = rows.length > PROFILE_DIRECTORY_PAGE_SIZE;
  const kept = rows.slice(0, PROFILE_DIRECTORY_PAGE_SIZE);
  const ordered = query.before ? kept.reverse() : kept;
  const first = ordered.at(0)?.key ?? null;
  const last = ordered.at(-1)?.key ?? null;
  if (query.before) return { rows: ordered, previous: hasMore ? first : null, next: last };
  return { rows: ordered, previous: query.after ? first : null, next: hasMore ? last : null };
}

export async function loadProfileDirectoryPage(env: Env, query: ProfileDirectoryQuery): Promise<ProfileDirectoryPage> {
  const db = createDb(env);
  const listing = LISTINGS[query.collection];
  const page = pageOf((await selectProfileDirectoryRows(db, query)).filter(isListed), query);
  const ownerIds = page.rows.map((row) => row.id);
  const counts = ownerIds.length > 0 ? await countPublicTemplatesOf(db, listing.ownerType, ownerIds) : [];
  const templatesByOwner = new Map(counts.map((row) => [row.owner, row.total]));

  return {
    collection: query.collection,
    profiles: page.rows.map((row) => ({
      handle: row.key.trim(),
      name: row.name?.trim() || null,
      avatar_url: row.avatar_url || null,
      public_template_count: templatesByOwner.get(row.id) ?? 0,
    })),
    next_cursor: page.next,
    previous_cursor: page.previous,
  };
}
