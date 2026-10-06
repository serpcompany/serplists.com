DROP TRIGGER sitemap_users_update_owner;
CREATE TRIGGER sitemap_users_update_owner AFTER UPDATE ON users
WHEN OLD.username IS NOT NEW.username OR OLD.name IS NOT NEW.name BEGIN
  INSERT INTO sitemap_owner_revisions VALUES(NEW.id,strftime('%Y-%m-%d %H:%M:%f','now')) ON CONFLICT(user_id) DO UPDATE SET revised_at=excluded.revised_at;
  INSERT INTO sitemap_category_revisions SELECT DISTINCT t.category,strftime('%Y-%m-%d %H:%M:%f','now') FROM templates t WHERE t.user_id=NEW.id AND t.owner_type='user' AND t.team_id IS NULL AND +t.is_public=1 AND t.deleted_at IS NULL AND t.category IS NOT NULL AND TRIM(t.category)<>'' ON CONFLICT(category) DO UPDATE SET revised_at=excluded.revised_at;
  UPDATE sitemap_revisions SET revised_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE
    (kind='templates' AND EXISTS (SELECT 1 FROM templates t WHERE t.user_id=NEW.id AND t.owner_type='user' AND t.team_id IS NULL AND +t.is_public=1 AND t.deleted_at IS NULL) AND (
      (LENGTH(TRIM(OLD.username)) BETWEEN 3 AND 30 AND TRIM(OLD.username) NOT GLOB '*[^A-Za-z0-9_.-]*') OR
      (LENGTH(TRIM(NEW.username)) BETWEEN 3 AND 30 AND TRIM(NEW.username) NOT GLOB '*[^A-Za-z0-9_.-]*')
    )) OR
    (kind='categories' AND EXISTS (SELECT 1 FROM templates t WHERE t.user_id=NEW.id AND t.owner_type='user' AND t.team_id IS NULL AND +t.is_public=1 AND t.deleted_at IS NULL AND t.category IS NOT NULL AND TRIM(t.category)<>''));
END;
DROP TRIGGER sitemap_users_delete;
CREATE TRIGGER sitemap_users_delete BEFORE DELETE ON users BEGIN
  INSERT INTO sitemap_category_revisions SELECT DISTINCT t.category,strftime('%Y-%m-%d %H:%M:%f','now') FROM templates t WHERE t.user_id=OLD.id AND t.owner_type='user' AND t.team_id IS NULL AND +t.is_public=1 AND t.deleted_at IS NULL AND t.category IS NOT NULL AND TRIM(t.category)<>'' ON CONFLICT(category) DO UPDATE SET revised_at=excluded.revised_at;
  UPDATE sitemap_revisions SET revised_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE
    (kind='profiles' AND LENGTH(TRIM(OLD.username)) BETWEEN 3 AND 30 AND TRIM(OLD.username) NOT GLOB '*[^A-Za-z0-9_.-]*') OR
    (kind='templates' AND LENGTH(TRIM(OLD.username)) BETWEEN 3 AND 30 AND TRIM(OLD.username) NOT GLOB '*[^A-Za-z0-9_.-]*' AND EXISTS (SELECT 1 FROM templates t WHERE t.user_id=OLD.id AND t.owner_type='user' AND t.team_id IS NULL AND +t.is_public=1 AND t.deleted_at IS NULL)) OR
    (kind='categories' AND EXISTS (SELECT 1 FROM templates t WHERE t.user_id=OLD.id AND t.owner_type='user' AND t.team_id IS NULL AND +t.is_public=1 AND t.deleted_at IS NULL AND t.category IS NOT NULL AND TRIM(t.category)<>''));
END;
