# Upload Quota and Ownership

- **Status:** active
- **Last updated:** 2026-09-28
- **Goal:** record every stored upload in D1 with its uploader, owner and references,
  so storage is capped per account, Organization editors can delete Organization
  media, and files nothing references can be cleaned up. Closes TD-16 and TD-17 in
  the [tech debt tracker](../tech-debt-tracker.md).

## Progress

- [x] Per-bucket size limits (avatars 5MB, Template media 50MB) shared with the
  client, and files with no or a generic type are typed by extension.
- [x] The router refuses an upload without a valid `Content-Length` (`411`), and
  `functions/api/handlers/uploads.ts` hands the parsed `File` to R2 instead of
  copying it into a second buffer.
- [x] `DELETE /api/uploads/file` deletes only the caller's own avatar; the Template
  editor only unlinks Template media.
- [ ] Human decisions (escalate): the quota numbers, which are pricing (for example
  per plan), and whether Organization uploads count against the uploader or the
  Organization. The statements below take the limits as parameters.
- [ ] Migration A (TD-16): `uploads` and `user_upload_usage`, with the Drizzle
  definitions below. Take the next free number in `db/migrations/` when it lands.
- [ ] Upload handler: reserve bytes, put the object, record the row; release the
  reservation when the put or the insert fails.
- [ ] Backfill: a `db/maintenance/` script that lists existing R2 keys, records each
  with the uploader from its key prefix, and charges it to that account.
- [ ] Migration B (TD-17): ownership columns and `upload_references`.
- [ ] Record references when Templates are saved, versions are snapshotted, Runs are
  created or updated, and avatars change; backfill them from existing rows.
- [ ] Owner-based `DELETE /api/uploads/file` (rule below), then remove the avatar-only
  check.
- [ ] Orphan cleanup for files with no references after a grace period.

## Proposed schema

Both migrations and the Drizzle module were checked together in a scratch copy of the
repository: `pnpm run check:db:drizzle-parity` passed (27 tables), and every statement
below ran against the replayed schema with `EXPLAIN QUERY PLAN` showing a primary key
or index search.

### Migration A: uploads and usage (TD-16)

```sql
CREATE TABLE uploads (
  key TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  bucket TEXT NOT NULL CHECK (bucket IN ('avatars', 'template-images', 'template-videos', 'template-files')),
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_uploads_user_id ON uploads(user_id);

CREATE TABLE user_upload_usage (
  user_id TEXT PRIMARY KEY NOT NULL,
  bytes INTEGER NOT NULL DEFAULT 0 CHECK (bytes >= 0),
  file_count INTEGER NOT NULL DEFAULT 0 CHECK (file_count >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

`user_id` is the uploader, who is charged for the bytes. Deleting a user cascades to
these rows but not to R2, so an account deletion flow must delete the user's objects
first.

### Migration B: ownership and references (TD-17)

```sql
ALTER TABLE uploads ADD COLUMN owner_type TEXT NOT NULL DEFAULT 'user' CHECK (owner_type IN ('user', 'team'));
ALTER TABLE uploads ADD COLUMN team_id TEXT REFERENCES teams(id) ON DELETE CASCADE;

CREATE INDEX idx_uploads_team_id ON uploads(team_id) WHERE team_id IS NOT NULL;

CREATE TABLE upload_references (
  upload_key TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('template', 'template_version', 'checklist_run', 'user_avatar')),
  resource_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (upload_key, resource_type, resource_id),
  FOREIGN KEY (upload_key) REFERENCES uploads(key) ON DELETE CASCADE
);

CREATE INDEX idx_upload_references_resource ON upload_references(resource_type, resource_id);
```

`owner_type` is `'user'` for Personal files and `'team'` (with `team_id` set) for
Organization files, following the existing `team` identifiers (TD-5). If both
migrations ship together, one `CREATE TABLE uploads` can declare `owner_type` and
`team_id` inline, as long as they stay the last two columns so the Drizzle definition
below still matches.

### Drizzle

A new schema module (`uploads.ts`), exported from `db/schema/index.ts` with
`export { uploads, user_upload_usage, upload_references } from "./uploads";`. Leave
out `owner_type`, `team_id`, `idx_uploads_team_id`, `uploads_owner_type_check` and
`upload_references` until migration B lands.

```ts
import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { teams } from "./teams";
import { users } from "./users";

export const UPLOAD_BUCKETS = ["avatars", "template-images", "template-videos", "template-files"] as const;
export const UPLOAD_OWNER_TYPES = ["user", "team"] as const;
export const UPLOAD_REFERENCE_TYPES = ["template", "template_version", "checklist_run", "user_avatar"] as const;

// One row per stored R2 object. user_id is the uploader, who is charged for its bytes.
export const uploads = sqliteTable(
  "uploads",
  {
    key: text("key").notNull(),
    user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    bucket: text("bucket", { enum: UPLOAD_BUCKETS }).notNull(),
    content_type: text("content_type").notNull(),
    size_bytes: integer("size_bytes").notNull(),
    created_at: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    deleted_at: text("deleted_at"),
    // Migration B: the Personal or Organization owner that authorizes deletes.
    owner_type: text("owner_type", { enum: UPLOAD_OWNER_TYPES }).notNull().default("user"),
    team_id: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.key] }),
    index("idx_uploads_user_id").on(table.user_id),
    index("idx_uploads_team_id").on(table.team_id).where(sql`${table.team_id} is not null`),
    check(
      "uploads_bucket_check",
      sql`${table.bucket} in ('avatars', 'template-images', 'template-videos', 'template-files')`,
    ),
    check("uploads_size_bytes_check", sql`${table.size_bytes} >= 0`),
    check("uploads_owner_type_check", sql`${table.owner_type} in ('user', 'team')`),
  ],
);

// Running totals per uploader, reserved atomically before each R2 put.
export const user_upload_usage = sqliteTable(
  "user_upload_usage",
  {
    user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    bytes: integer("bytes").notNull().default(0),
    file_count: integer("file_count").notNull().default(0),
    updated_at: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.user_id] }),
    check("user_upload_usage_bytes_check", sql`${table.bytes} >= 0`),
    check("user_upload_usage_file_count_check", sql`${table.file_count} >= 0`),
  ],
);

// Which Templates, template versions, Runs and avatars point at each upload.
export const upload_references = sqliteTable(
  "upload_references",
  {
    upload_key: text("upload_key").notNull().references(() => uploads.key, { onDelete: "cascade" }),
    resource_type: text("resource_type", { enum: UPLOAD_REFERENCE_TYPES }).notNull(),
    resource_id: text("resource_id").notNull(),
    created_at: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.upload_key, table.resource_type, table.resource_id] }),
    index("idx_upload_references_resource").on(table.resource_type, table.resource_id),
    check(
      "upload_references_resource_type_check",
      sql`${table.resource_type} in ('template', 'template_version', 'checklist_run', 'user_avatar')`,
    ),
  ],
);
```

## Statements

**Reserve** before the R2 put. `?1` user id, `?2` file size, `?3` byte quota, `?4`
file-count quota, `?5` now. No returned row means the quota is full: answer `413` and
do not store the file. The first upload inserts without the `WHERE`, which is safe
while the largest file (50MB) is below the quota.

```sql
INSERT INTO user_upload_usage (user_id, bytes, file_count, updated_at)
VALUES (?1, ?2, 1, ?5)
ON CONFLICT (user_id) DO UPDATE SET
  bytes = user_upload_usage.bytes + excluded.bytes,
  file_count = user_upload_usage.file_count + 1,
  updated_at = excluded.updated_at
WHERE user_upload_usage.bytes + excluded.bytes <= ?3
  AND user_upload_usage.file_count + 1 <= ?4
RETURNING bytes, file_count;
```

**Record** after the put succeeds (`owner_type` and `team_id` from migration B; an
Organization upload requires an active editor-or-higher membership in `team_id`). If
the insert fails, delete the object and release.

```sql
INSERT INTO uploads (key, user_id, bucket, content_type, size_bytes, created_at, owner_type, team_id)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8);
```

**Release** when the put or the record fails, and after a delete. `?1` the uploader's
user id (from the row, not the caller), `?2` size, `?3` now.

```sql
UPDATE user_upload_usage
SET bytes = max(bytes - ?2, 0), file_count = max(file_count - 1, 0), updated_at = ?3
WHERE user_id = ?1;
```

**Replace references** for one resource in the same D1 batch as the save that changes
it (`?1` key, `?2` resource type, `?3` resource id, `?4` now). Keys come from the
saved content with `getUploadedAssetKey` (`src/lib/utils/fileUpload.ts`); a key with no
`uploads` row is skipped.

```sql
DELETE FROM upload_references WHERE resource_type = ?2 AND resource_id = ?3;

INSERT OR IGNORE INTO upload_references (upload_key, resource_type, resource_id, created_at)
SELECT key, ?2, ?3, ?4 FROM uploads WHERE key = ?1 AND deleted_at IS NULL;
```

## Delete authorization

One lookup gives everything the rule needs (`?1` key, `?2` caller's user id):

```sql
SELECT u.key, u.user_id, u.owner_type, u.team_id, u.size_bytes,
  (SELECT m.role FROM team_members m
    WHERE m.team_id = u.team_id AND m.user_id = ?2 AND m.status = 'active') AS member_role,
  EXISTS (SELECT 1 FROM upload_references r WHERE r.upload_key = u.key) AS referenced
FROM uploads u
WHERE u.key = ?1 AND u.deleted_at IS NULL;
```

- No row: `404`. Keys are never parsed for ownership.
- Personal file (`owner_type = 'user'`): only the uploader (`user_id` is the caller).
- Organization file (`owner_type = 'team'`): only an active editor, admin or owner of
  `team_id` (`member_role` at least `editor`, as `canEditTeamTemplates`). Having
  uploaded the file grants nothing, so a disabled or removed member is refused.
- Referenced (`referenced = 1`): `409`, because a Template, version, Run or clone still
  shows it. The editor keeps only unlinking.
- Otherwise set `deleted_at`, delete the R2 object, release the uploader's usage, then
  delete the row. A row left with `deleted_at` set (a failed R2 delete) is retried by
  the cleanup job.

## Decision log

- 2026-09-28: The router answers an upload without a valid `Content-Length` with
  `411` instead of counting streamed bytes. Counting tees the body into memory, and
  the handler's `formData()` buffers the whole body before it can check the file size.
  Browsers always send the length for `FormData`.
- 2026-09-28: The schema is proposed here, not migrated, because several bug-fix
  branches were landing at once and migration numbers would collide. Charging the
  uploader (not the Organization) is the proposed default, pending the human decision
  above.
- 2026-09-28: One `uploads` table carries ownership, and references live in their own
  table, rather than storing ownership in R2 custom metadata: deletes and quota checks
  then need one indexed D1 lookup and no R2 `head()`, and clones of public Templates
  keep their source's files alive through their own reference rows.
