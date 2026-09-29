# Sitemap Revisions for Organization Templates

- **Status:** active
- **Last updated:** 2026-09-28
- **Goal:** an edit to a public Organization Template, or to its Creator, refreshes the
  cached sitemaps the same way a Personal Template edit does. Closes TD-23 in the
  [tech debt tracker](../tech-debt-tracker.md).

## Progress

- [x] The sitemaps list public Organization Templates under the Creator's username:
  `publicTemplateCondition` in `functions/sitemap/shared.ts` (commit 7e2befeb).
- [ ] Human approval (escalate): the migration below writes to the triggers and
  revision tables on staging and production D1.
- [ ] Land the migration with the next free number in `db/migrations/`, and the
  companion changes listed below.

## What stays stale until then

The revision triggers from migration 0023 fire only for Personal rows, and each
sitemap is cached under its `sitemap_revisions` kinds (`functions/sitemap/cache.ts`)
for up to a day. Until the migration lands:

- An edit, publish, unpublish or delete of a public Organization Template reaches the
  templates, categories and index sitemaps only when the cached copy expires.
- A category that only public Organization Templates use has no
  `sitemap_category_revisions` row, so its lastmod follows the Templates alone.
- A Creator rename does not refresh the Organization Template URLs in cached sitemaps.
  When the Creator has only public Organization Templates, `sitemap_users_update_owner`
  bumps neither `templates` nor `categories`, so a cached templates shard keeps
  listing `/profile/<old username>/<slug>` until it expires.

## Proposed migration

Checked with `node:sqlite`: every file in `db/migrations/` replays to exactly the
triggers in `db/sql-only-schema.json`, and this migration then changes only the five
triggers it recreates. On fixtures it keeps every expectation in
`tests/unit/functions/sitemap-migrations.test.ts` for Personal rows, and:

- inserting, editing, publishing, unpublishing or deleting a public Organization
  Template bumps `templates` and `categories` and the Template's category row, but
  neither `profiles` nor any `sitemap_profile_revisions` row;
- a row whose owner fields disagree (a user row with a `team_id`, a team row with a
  blank or no `team_id`) bumps nothing;
- moving a public Personal Template into an Organization still bumps `profiles` and
  the Creator's profile row;
- renaming or deleting a Creator who has only public Organization Templates bumps
  `templates`, and for categorized Templates `categories` and their category rows;
- the backfill adds a row for a category only Organization Templates use and keeps
  the later date when a Personal Template already dated the category (compared with
  `julianday`, because the rows mix ISO and SQLite date formats).

`EXPLAIN QUERY PLAN` shows the widened lookups use `idx_templates_public_created_at`,
the same index as the 0023 triggers.

```sql
-- Public Organization Templates are listed in the sitemaps under their Creator's username
-- (publicTemplateCondition in functions/sitemap/shared.ts). Recreate the 0023 triggers so
-- writes to those rows, and to their Creators, bump the same revisions as Personal rows.
-- Profile revisions stay Personal-only: profile pages list only Personal Templates.
DROP TRIGGER IF EXISTS sitemap_templates_insert;
DROP TRIGGER IF EXISTS sitemap_templates_update;
DROP TRIGGER IF EXISTS sitemap_templates_delete;
DROP TRIGGER IF EXISTS sitemap_users_update_owner;
DROP TRIGGER IF EXISTS sitemap_users_delete;

CREATE TRIGGER sitemap_templates_insert AFTER INSERT ON templates
WHEN NEW.is_public=1 AND NEW.deleted_at IS NULL AND ((NEW.owner_type='user' AND NEW.team_id IS NULL) OR (NEW.owner_type='team' AND NEW.team_id IS NOT NULL AND NEW.team_id<>'')) BEGIN
  INSERT INTO sitemap_profile_revisions SELECT NEW.user_id,strftime('%Y-%m-%d %H:%M:%f','now') WHERE NEW.owner_type='user' AND NEW.team_id IS NULL ON CONFLICT(user_id) DO UPDATE SET revised_at=excluded.revised_at;
  INSERT INTO sitemap_category_revisions SELECT NEW.category,strftime('%Y-%m-%d %H:%M:%f','now') WHERE NEW.category IS NOT NULL AND TRIM(NEW.category)<>'' ON CONFLICT(category) DO UPDATE SET revised_at=excluded.revised_at;
  UPDATE sitemap_revisions SET revised_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE kind<>'profiles' OR (NEW.owner_type='user' AND NEW.team_id IS NULL);
END;
CREATE TRIGGER sitemap_templates_update AFTER UPDATE ON templates
WHEN (OLD.is_public=1 AND OLD.deleted_at IS NULL AND ((OLD.owner_type='user' AND OLD.team_id IS NULL) OR (OLD.owner_type='team' AND OLD.team_id IS NOT NULL AND OLD.team_id<>''))) OR (NEW.is_public=1 AND NEW.deleted_at IS NULL AND ((NEW.owner_type='user' AND NEW.team_id IS NULL) OR (NEW.owner_type='team' AND NEW.team_id IS NOT NULL AND NEW.team_id<>''))) BEGIN
  INSERT INTO sitemap_profile_revisions SELECT OLD.user_id,strftime('%Y-%m-%d %H:%M:%f','now') WHERE (OLD.owner_type='user' AND OLD.team_id IS NULL AND OLD.is_public=1 AND OLD.deleted_at IS NULL) OR (NEW.owner_type='user' AND NEW.team_id IS NULL AND NEW.is_public=1 AND NEW.deleted_at IS NULL) ON CONFLICT(user_id) DO UPDATE SET revised_at=excluded.revised_at;
  INSERT INTO sitemap_profile_revisions SELECT NEW.user_id,strftime('%Y-%m-%d %H:%M:%f','now') WHERE (OLD.owner_type='user' AND OLD.team_id IS NULL AND OLD.is_public=1 AND OLD.deleted_at IS NULL) OR (NEW.owner_type='user' AND NEW.team_id IS NULL AND NEW.is_public=1 AND NEW.deleted_at IS NULL) ON CONFLICT(user_id) DO UPDATE SET revised_at=excluded.revised_at;
  INSERT INTO sitemap_category_revisions SELECT OLD.category,strftime('%Y-%m-%d %H:%M:%f','now') WHERE OLD.category IS NOT NULL AND TRIM(OLD.category)<>'' ON CONFLICT(category) DO UPDATE SET revised_at=excluded.revised_at;
  INSERT INTO sitemap_category_revisions SELECT NEW.category,strftime('%Y-%m-%d %H:%M:%f','now') WHERE NEW.category IS NOT NULL AND TRIM(NEW.category)<>'' ON CONFLICT(category) DO UPDATE SET revised_at=excluded.revised_at;
  UPDATE sitemap_revisions SET revised_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE kind<>'profiles' OR (OLD.owner_type='user' AND OLD.team_id IS NULL AND OLD.is_public=1 AND OLD.deleted_at IS NULL) OR (NEW.owner_type='user' AND NEW.team_id IS NULL AND NEW.is_public=1 AND NEW.deleted_at IS NULL);
END;
CREATE TRIGGER sitemap_templates_delete AFTER DELETE ON templates
WHEN OLD.is_public=1 AND OLD.deleted_at IS NULL AND ((OLD.owner_type='user' AND OLD.team_id IS NULL) OR (OLD.owner_type='team' AND OLD.team_id IS NOT NULL AND OLD.team_id<>'')) BEGIN
  INSERT INTO sitemap_profile_revisions SELECT OLD.user_id,strftime('%Y-%m-%d %H:%M:%f','now') WHERE OLD.owner_type='user' AND OLD.team_id IS NULL ON CONFLICT(user_id) DO UPDATE SET revised_at=excluded.revised_at;
  INSERT INTO sitemap_category_revisions SELECT OLD.category,strftime('%Y-%m-%d %H:%M:%f','now') WHERE OLD.category IS NOT NULL AND TRIM(OLD.category)<>'' ON CONFLICT(category) DO UPDATE SET revised_at=excluded.revised_at;
  UPDATE sitemap_revisions SET revised_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE kind<>'profiles' OR (OLD.owner_type='user' AND OLD.team_id IS NULL);
END;
CREATE TRIGGER sitemap_users_update_owner AFTER UPDATE ON users
WHEN OLD.username IS NOT NEW.username OR OLD.name IS NOT NEW.name BEGIN
  INSERT INTO sitemap_owner_revisions VALUES(NEW.id,strftime('%Y-%m-%d %H:%M:%f','now')) ON CONFLICT(user_id) DO UPDATE SET revised_at=excluded.revised_at;
  INSERT INTO sitemap_category_revisions SELECT DISTINCT t.category,strftime('%Y-%m-%d %H:%M:%f','now') FROM templates t WHERE t.user_id=NEW.id AND t.is_public=1 AND t.deleted_at IS NULL AND ((t.owner_type='user' AND t.team_id IS NULL) OR (t.owner_type='team' AND t.team_id IS NOT NULL AND t.team_id<>'')) AND t.category IS NOT NULL AND TRIM(t.category)<>'' ON CONFLICT(category) DO UPDATE SET revised_at=excluded.revised_at;
  UPDATE sitemap_revisions SET revised_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE
    (kind='templates' AND EXISTS (SELECT 1 FROM templates t WHERE t.user_id=NEW.id AND t.is_public=1 AND t.deleted_at IS NULL AND ((t.owner_type='user' AND t.team_id IS NULL) OR (t.owner_type='team' AND t.team_id IS NOT NULL AND t.team_id<>''))) AND (
      (LENGTH(TRIM(OLD.username)) BETWEEN 3 AND 30 AND TRIM(OLD.username) NOT GLOB '*[^A-Za-z0-9_.]*') OR
      (LENGTH(TRIM(NEW.username)) BETWEEN 3 AND 30 AND TRIM(NEW.username) NOT GLOB '*[^A-Za-z0-9_.]*')
    )) OR
    (kind='categories' AND EXISTS (SELECT 1 FROM templates t WHERE t.user_id=NEW.id AND t.is_public=1 AND t.deleted_at IS NULL AND ((t.owner_type='user' AND t.team_id IS NULL) OR (t.owner_type='team' AND t.team_id IS NOT NULL AND t.team_id<>'')) AND t.category IS NOT NULL AND TRIM(t.category)<>''));
END;
CREATE TRIGGER sitemap_users_delete BEFORE DELETE ON users BEGIN
  INSERT INTO sitemap_category_revisions SELECT DISTINCT t.category,strftime('%Y-%m-%d %H:%M:%f','now') FROM templates t WHERE t.user_id=OLD.id AND t.is_public=1 AND t.deleted_at IS NULL AND ((t.owner_type='user' AND t.team_id IS NULL) OR (t.owner_type='team' AND t.team_id IS NOT NULL AND t.team_id<>'')) AND t.category IS NOT NULL AND TRIM(t.category)<>'' ON CONFLICT(category) DO UPDATE SET revised_at=excluded.revised_at;
  UPDATE sitemap_revisions SET revised_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE
    (kind='profiles' AND LENGTH(TRIM(OLD.username)) BETWEEN 3 AND 30 AND TRIM(OLD.username) NOT GLOB '*[^A-Za-z0-9_.]*') OR
    (kind='templates' AND LENGTH(TRIM(OLD.username)) BETWEEN 3 AND 30 AND TRIM(OLD.username) NOT GLOB '*[^A-Za-z0-9_.]*' AND EXISTS (SELECT 1 FROM templates t WHERE t.user_id=OLD.id AND t.is_public=1 AND t.deleted_at IS NULL AND ((t.owner_type='user' AND t.team_id IS NULL) OR (t.owner_type='team' AND t.team_id IS NOT NULL AND t.team_id<>'')))) OR
    (kind='categories' AND EXISTS (SELECT 1 FROM templates t WHERE t.user_id=OLD.id AND t.is_public=1 AND t.deleted_at IS NULL AND ((t.owner_type='user' AND t.team_id IS NULL) OR (t.owner_type='team' AND t.team_id IS NOT NULL AND t.team_id<>'')) AND t.category IS NOT NULL AND TRIM(t.category)<>''));
END;

-- Categories that only public Organization Templates use get a revision time, and a
-- category a Personal Template already dated keeps the later of the two.
INSERT INTO sitemap_category_revisions(category, revised_at)
SELECT category, COALESCE(updated_at, created_at) FROM templates
 WHERE owner_type='team' AND team_id IS NOT NULL AND team_id<>'' AND is_public=1 AND deleted_at IS NULL
   AND category IS NOT NULL AND TRIM(category)<>''
ON CONFLICT(category) DO UPDATE SET revised_at=excluded.revised_at
 WHERE julianday(excluded.revised_at) > COALESCE(julianday(sitemap_category_revisions.revised_at), 0);

-- The templates and categories shards now list more rows: miss every cached copy.
UPDATE sitemap_revisions SET revised_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE kind IN ('templates', 'categories');
```

## Companion changes

- `db/sql-only-schema.json`: replace the definitions of `sitemap_templates_insert`,
  `sitemap_templates_update`, `sitemap_templates_delete`, `sitemap_users_update_owner`
  and `sitemap_users_delete` with the new trigger text, whitespace collapsed (the
  replay in `pnpm run check:db:drizzle-parity` reports any difference).
- `db/schema.sql`: no change. It holds tables and indexes only, and the migration
  changes neither.
- `docs/generated/db-schema.md`: `pnpm run db:schema:generate`.
- `tests/unit/functions/sitemap-migrations.test.ts`: apply the new migration after
  0023 in both tests, and add the Organization cases above.
- `functions/sitemap/shared.ts` and `functions/sitemap/cache.ts`: drop the comment
  that the triggers fire only for Personal rows, and name the new migration beside
  0023.
- `docs/exec-plans/tech-debt-tracker.md`: delete the TD-23 row.

## Decision log

- 2026-09-28: List public Organization Templates in the sitemaps (option (a) of the
  bug report), since the library, category pages and link previews already treat them
  as public pages. Rejected: keeping them out of search, which would contradict the
  documented Share and visibility flows.
- 2026-09-28: Keep `sitemap_profile_revisions` and the `profiles` kind Personal-only.
  Profile pages and the profiles sitemap list only Personal Templates, so an
  Organization edit should not move a Creator's profile lastmod.
- 2026-09-28: Shipped the query change without the migration (migrations need human
  approval). The cost is the staleness above, bounded by the one-day cache.
