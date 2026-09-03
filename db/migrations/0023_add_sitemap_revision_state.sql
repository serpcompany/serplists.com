CREATE TABLE sitemap_revisions (
  kind TEXT PRIMARY KEY CHECK (kind IN ('profiles', 'templates', 'categories')),
  revised_at TEXT NOT NULL
);
CREATE TABLE sitemap_profile_revisions (
  user_id TEXT PRIMARY KEY,
  revised_at TEXT NOT NULL
);
CREATE TABLE sitemap_owner_revisions (
  user_id TEXT PRIMARY KEY,
  revised_at TEXT NOT NULL
);
CREATE TABLE sitemap_category_revisions (
  category TEXT PRIMARY KEY,
  revised_at TEXT NOT NULL
);
CREATE TABLE sitemap_shard_revisions (
  kind TEXT NOT NULL,
  page INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  revised_at TEXT NOT NULL,
  PRIMARY KEY (kind, page)
);

INSERT INTO sitemap_revisions(kind, revised_at)
SELECT 'profiles', COALESCE((
  SELECT value FROM (
    SELECT COALESCE(u.updated_at, u.created_at) value FROM users u
    UNION ALL SELECT datetime(u.auth_updated_at / 1000, 'unixepoch') FROM users u WHERE u.auth_updated_at IS NOT NULL
    UNION ALL SELECT COALESCE(t.updated_at, t.created_at) FROM templates t
      WHERE t.owner_type='user' AND t.team_id IS NULL AND t.is_public=1 AND t.deleted_at IS NULL
  ) ORDER BY julianday(value) DESC LIMIT 1
), '1970-01-01 00:00:00')
UNION ALL SELECT 'templates', COALESCE((
  SELECT value FROM (
    SELECT COALESCE(t.updated_at, t.created_at) value FROM templates t
      WHERE t.owner_type='user' AND t.team_id IS NULL AND t.is_public=1 AND t.deleted_at IS NULL
    UNION ALL SELECT COALESCE(u.updated_at, u.created_at) FROM users u
      WHERE EXISTS (SELECT 1 FROM templates t WHERE t.user_id=u.id AND t.owner_type='user' AND t.team_id IS NULL AND t.is_public=1 AND t.deleted_at IS NULL)
    UNION ALL SELECT datetime(u.auth_updated_at / 1000, 'unixepoch') FROM users u
      WHERE u.auth_updated_at IS NOT NULL AND EXISTS (SELECT 1 FROM templates t WHERE t.user_id=u.id AND t.owner_type='user' AND t.team_id IS NULL AND t.is_public=1 AND t.deleted_at IS NULL)
  ) ORDER BY julianday(value) DESC LIMIT 1
), '1970-01-01 00:00:00')
UNION ALL SELECT 'categories', COALESCE((
  SELECT COALESCE(t.updated_at, t.created_at) FROM templates t
   WHERE t.owner_type='user' AND t.team_id IS NULL AND t.is_public=1 AND t.deleted_at IS NULL
     AND t.category IS NOT NULL AND TRIM(t.category)<>''
   ORDER BY julianday(COALESCE(t.updated_at,t.created_at)) DESC LIMIT 1
), '1970-01-01 00:00:00');

INSERT INTO sitemap_profile_revisions(user_id, revised_at)
SELECT u.id, (SELECT value FROM (
  SELECT COALESCE(u.updated_at,u.created_at) value
  UNION ALL SELECT datetime(u.auth_updated_at/1000,'unixepoch') WHERE u.auth_updated_at IS NOT NULL
  UNION ALL SELECT COALESCE(t.updated_at,t.created_at) FROM templates t
   WHERE t.user_id=u.id AND t.owner_type='user' AND t.team_id IS NULL AND t.is_public=1 AND t.deleted_at IS NULL
) ORDER BY julianday(value) DESC LIMIT 1) FROM users u;

INSERT INTO sitemap_owner_revisions(user_id, revised_at)
SELECT id, COALESCE(updated_at, created_at) FROM users;

INSERT OR IGNORE INTO sitemap_category_revisions(category,revised_at)
SELECT category, COALESCE(updated_at,created_at) FROM templates
 WHERE owner_type='user' AND team_id IS NULL AND is_public=1 AND deleted_at IS NULL
   AND category IS NOT NULL AND TRIM(category)<>'';

CREATE TRIGGER sitemap_templates_insert AFTER INSERT ON templates
WHEN NEW.owner_type='user' AND NEW.team_id IS NULL AND NEW.is_public=1 AND NEW.deleted_at IS NULL BEGIN
  INSERT INTO sitemap_profile_revisions VALUES(NEW.user_id,strftime('%Y-%m-%d %H:%M:%f','now')) ON CONFLICT(user_id) DO UPDATE SET revised_at=excluded.revised_at;
  INSERT INTO sitemap_category_revisions SELECT NEW.category,strftime('%Y-%m-%d %H:%M:%f','now') WHERE NEW.category IS NOT NULL AND TRIM(NEW.category)<>'' ON CONFLICT(category) DO UPDATE SET revised_at=excluded.revised_at;
  UPDATE sitemap_revisions SET revised_at=strftime('%Y-%m-%d %H:%M:%f','now');
END;
CREATE TRIGGER sitemap_templates_update AFTER UPDATE ON templates
WHEN (OLD.owner_type='user' AND OLD.team_id IS NULL AND OLD.is_public=1 AND OLD.deleted_at IS NULL) OR (NEW.owner_type='user' AND NEW.team_id IS NULL AND NEW.is_public=1 AND NEW.deleted_at IS NULL) BEGIN
  INSERT INTO sitemap_profile_revisions VALUES(OLD.user_id,strftime('%Y-%m-%d %H:%M:%f','now')) ON CONFLICT(user_id) DO UPDATE SET revised_at=excluded.revised_at;
  INSERT INTO sitemap_profile_revisions VALUES(NEW.user_id,strftime('%Y-%m-%d %H:%M:%f','now')) ON CONFLICT(user_id) DO UPDATE SET revised_at=excluded.revised_at;
  INSERT INTO sitemap_category_revisions SELECT OLD.category,strftime('%Y-%m-%d %H:%M:%f','now') WHERE OLD.category IS NOT NULL AND TRIM(OLD.category)<>'' ON CONFLICT(category) DO UPDATE SET revised_at=excluded.revised_at;
  INSERT INTO sitemap_category_revisions SELECT NEW.category,strftime('%Y-%m-%d %H:%M:%f','now') WHERE NEW.category IS NOT NULL AND TRIM(NEW.category)<>'' ON CONFLICT(category) DO UPDATE SET revised_at=excluded.revised_at;
  UPDATE sitemap_revisions SET revised_at=strftime('%Y-%m-%d %H:%M:%f','now');
END;
CREATE TRIGGER sitemap_templates_delete AFTER DELETE ON templates
WHEN OLD.owner_type='user' AND OLD.team_id IS NULL AND OLD.is_public=1 AND OLD.deleted_at IS NULL BEGIN
  INSERT INTO sitemap_profile_revisions VALUES(OLD.user_id,strftime('%Y-%m-%d %H:%M:%f','now')) ON CONFLICT(user_id) DO UPDATE SET revised_at=excluded.revised_at;
  INSERT INTO sitemap_category_revisions SELECT OLD.category,strftime('%Y-%m-%d %H:%M:%f','now') WHERE OLD.category IS NOT NULL AND TRIM(OLD.category)<>'' ON CONFLICT(category) DO UPDATE SET revised_at=excluded.revised_at;
  UPDATE sitemap_revisions SET revised_at=strftime('%Y-%m-%d %H:%M:%f','now');
END;
CREATE TRIGGER sitemap_users_insert AFTER INSERT ON users
WHEN LENGTH(TRIM(NEW.username)) BETWEEN 3 AND 30
 AND TRIM(NEW.username) NOT GLOB '*[^A-Za-z0-9_.]*' BEGIN
  INSERT INTO sitemap_profile_revisions VALUES(NEW.id,strftime('%Y-%m-%d %H:%M:%f','now')) ON CONFLICT(user_id) DO UPDATE SET revised_at=excluded.revised_at;
  UPDATE sitemap_revisions SET revised_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE kind='profiles';
END;
CREATE TRIGGER sitemap_owner_users_insert AFTER INSERT ON users BEGIN
  INSERT INTO sitemap_owner_revisions VALUES(NEW.id,COALESCE(NEW.updated_at,NEW.created_at));
END;
CREATE TRIGGER sitemap_users_update_profile AFTER UPDATE ON users
WHEN OLD.username IS NOT NEW.username OR OLD.name IS NOT NEW.name OR OLD.avatar_url IS NOT NEW.avatar_url BEGIN
  INSERT INTO sitemap_profile_revisions VALUES(NEW.id,strftime('%Y-%m-%d %H:%M:%f','now')) ON CONFLICT(user_id) DO UPDATE SET revised_at=excluded.revised_at;
  UPDATE sitemap_revisions SET revised_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE kind='profiles' AND (
    (LENGTH(TRIM(OLD.username)) BETWEEN 3 AND 30 AND TRIM(OLD.username) NOT GLOB '*[^A-Za-z0-9_.]*') OR
    (LENGTH(TRIM(NEW.username)) BETWEEN 3 AND 30 AND TRIM(NEW.username) NOT GLOB '*[^A-Za-z0-9_.]*')
  );
END;
CREATE TRIGGER sitemap_users_update_owner AFTER UPDATE ON users
WHEN OLD.username IS NOT NEW.username OR OLD.name IS NOT NEW.name BEGIN
  INSERT INTO sitemap_owner_revisions VALUES(NEW.id,strftime('%Y-%m-%d %H:%M:%f','now')) ON CONFLICT(user_id) DO UPDATE SET revised_at=excluded.revised_at;
  INSERT INTO sitemap_category_revisions SELECT DISTINCT t.category,strftime('%Y-%m-%d %H:%M:%f','now') FROM templates t WHERE t.user_id=NEW.id AND t.owner_type='user' AND t.team_id IS NULL AND t.is_public=1 AND t.deleted_at IS NULL AND t.category IS NOT NULL AND TRIM(t.category)<>'' ON CONFLICT(category) DO UPDATE SET revised_at=excluded.revised_at;
  UPDATE sitemap_revisions SET revised_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE
    (kind='templates' AND EXISTS (SELECT 1 FROM templates t WHERE t.user_id=NEW.id AND t.owner_type='user' AND t.team_id IS NULL AND t.is_public=1 AND t.deleted_at IS NULL) AND (
      (LENGTH(TRIM(OLD.username)) BETWEEN 3 AND 30 AND TRIM(OLD.username) NOT GLOB '*[^A-Za-z0-9_.]*') OR
      (LENGTH(TRIM(NEW.username)) BETWEEN 3 AND 30 AND TRIM(NEW.username) NOT GLOB '*[^A-Za-z0-9_.]*')
    )) OR
    (kind='categories' AND EXISTS (SELECT 1 FROM templates t WHERE t.user_id=NEW.id AND t.owner_type='user' AND t.team_id IS NULL AND t.is_public=1 AND t.deleted_at IS NULL AND t.category IS NOT NULL AND TRIM(t.category)<>''));
END;
CREATE TRIGGER sitemap_users_delete BEFORE DELETE ON users BEGIN
  INSERT INTO sitemap_category_revisions SELECT DISTINCT t.category,strftime('%Y-%m-%d %H:%M:%f','now') FROM templates t WHERE t.user_id=OLD.id AND t.owner_type='user' AND t.team_id IS NULL AND t.is_public=1 AND t.deleted_at IS NULL AND t.category IS NOT NULL AND TRIM(t.category)<>'' ON CONFLICT(category) DO UPDATE SET revised_at=excluded.revised_at;
  UPDATE sitemap_revisions SET revised_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE
    (kind='profiles' AND LENGTH(TRIM(OLD.username)) BETWEEN 3 AND 30 AND TRIM(OLD.username) NOT GLOB '*[^A-Za-z0-9_.]*') OR
    (kind='templates' AND LENGTH(TRIM(OLD.username)) BETWEEN 3 AND 30 AND TRIM(OLD.username) NOT GLOB '*[^A-Za-z0-9_.]*' AND EXISTS (SELECT 1 FROM templates t WHERE t.user_id=OLD.id AND t.owner_type='user' AND t.team_id IS NULL AND t.is_public=1 AND t.deleted_at IS NULL)) OR
    (kind='categories' AND EXISTS (SELECT 1 FROM templates t WHERE t.user_id=OLD.id AND t.owner_type='user' AND t.team_id IS NULL AND t.is_public=1 AND t.deleted_at IS NULL AND t.category IS NOT NULL AND TRIM(t.category)<>''));
END;
CREATE TRIGGER sitemap_users_delete_cleanup AFTER DELETE ON users BEGIN
  DELETE FROM sitemap_profile_revisions WHERE user_id=OLD.id;
  DELETE FROM sitemap_owner_revisions WHERE user_id=OLD.id;
END;
