DROP TRIGGER sitemap_templates_insert;
CREATE TRIGGER sitemap_templates_insert AFTER INSERT ON templates
WHEN NEW.is_public=1 AND NEW.deleted_at IS NULL AND ((NEW.owner_type='user' AND NEW.team_id IS NULL) OR (NEW.owner_type='team' AND NEW.team_id IS NOT NULL AND NEW.team_id<>'')) BEGIN
  INSERT INTO sitemap_profile_revisions SELECT NEW.user_id,strftime('%Y-%m-%d %H:%M:%f','now') WHERE NEW.owner_type='user' AND NEW.team_id IS NULL ON CONFLICT(user_id) DO UPDATE SET revised_at=excluded.revised_at;
  INSERT INTO sitemap_category_revisions SELECT NEW.category,strftime('%Y-%m-%d %H:%M:%f','now') WHERE NEW.category IS NOT NULL AND TRIM(NEW.category)<>'' ON CONFLICT(category) DO UPDATE SET revised_at=excluded.revised_at;
  UPDATE sitemap_revisions SET revised_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE kind<>'profiles' OR (NEW.owner_type='user' AND NEW.team_id IS NULL);
END;
DROP TRIGGER sitemap_templates_update;
CREATE TRIGGER sitemap_templates_update AFTER UPDATE ON templates
WHEN (OLD.is_public=1 AND OLD.deleted_at IS NULL AND ((OLD.owner_type='user' AND OLD.team_id IS NULL) OR (OLD.owner_type='team' AND OLD.team_id IS NOT NULL AND OLD.team_id<>''))) OR (NEW.is_public=1 AND NEW.deleted_at IS NULL AND ((NEW.owner_type='user' AND NEW.team_id IS NULL) OR (NEW.owner_type='team' AND NEW.team_id IS NOT NULL AND NEW.team_id<>''))) BEGIN
  INSERT INTO sitemap_profile_revisions SELECT OLD.user_id,strftime('%Y-%m-%d %H:%M:%f','now') WHERE (OLD.owner_type='user' AND OLD.team_id IS NULL AND OLD.is_public=1 AND OLD.deleted_at IS NULL) OR (NEW.owner_type='user' AND NEW.team_id IS NULL AND NEW.is_public=1 AND NEW.deleted_at IS NULL) ON CONFLICT(user_id) DO UPDATE SET revised_at=excluded.revised_at;
  INSERT INTO sitemap_profile_revisions SELECT NEW.user_id,strftime('%Y-%m-%d %H:%M:%f','now') WHERE (OLD.owner_type='user' AND OLD.team_id IS NULL AND OLD.is_public=1 AND OLD.deleted_at IS NULL) OR (NEW.owner_type='user' AND NEW.team_id IS NULL AND NEW.is_public=1 AND NEW.deleted_at IS NULL) ON CONFLICT(user_id) DO UPDATE SET revised_at=excluded.revised_at;
  INSERT INTO sitemap_category_revisions SELECT OLD.category,strftime('%Y-%m-%d %H:%M:%f','now') WHERE OLD.category IS NOT NULL AND TRIM(OLD.category)<>'' ON CONFLICT(category) DO UPDATE SET revised_at=excluded.revised_at;
  INSERT INTO sitemap_category_revisions SELECT NEW.category,strftime('%Y-%m-%d %H:%M:%f','now') WHERE NEW.category IS NOT NULL AND TRIM(NEW.category)<>'' ON CONFLICT(category) DO UPDATE SET revised_at=excluded.revised_at;
  UPDATE sitemap_revisions SET revised_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE kind<>'profiles' OR (OLD.owner_type='user' AND OLD.team_id IS NULL AND OLD.is_public=1 AND OLD.deleted_at IS NULL) OR (NEW.owner_type='user' AND NEW.team_id IS NULL AND NEW.is_public=1 AND NEW.deleted_at IS NULL);
END;
DROP TRIGGER sitemap_templates_delete;
CREATE TRIGGER sitemap_templates_delete AFTER DELETE ON templates
WHEN OLD.is_public=1 AND OLD.deleted_at IS NULL AND ((OLD.owner_type='user' AND OLD.team_id IS NULL) OR (OLD.owner_type='team' AND OLD.team_id IS NOT NULL AND OLD.team_id<>'')) BEGIN
  INSERT INTO sitemap_profile_revisions SELECT OLD.user_id,strftime('%Y-%m-%d %H:%M:%f','now') WHERE OLD.owner_type='user' AND OLD.team_id IS NULL ON CONFLICT(user_id) DO UPDATE SET revised_at=excluded.revised_at;
  INSERT INTO sitemap_category_revisions SELECT OLD.category,strftime('%Y-%m-%d %H:%M:%f','now') WHERE OLD.category IS NOT NULL AND TRIM(OLD.category)<>'' ON CONFLICT(category) DO UPDATE SET revised_at=excluded.revised_at;
  UPDATE sitemap_revisions SET revised_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE kind<>'profiles' OR (OLD.owner_type='user' AND OLD.team_id IS NULL);
END;
CREATE TRIGGER sitemap_teams_insert AFTER INSERT ON teams
WHEN NEW.archived_at IS NULL AND LENGTH(TRIM(NEW.slug)) BETWEEN 3 AND 30 AND TRIM(NEW.slug) NOT GLOB '*[^A-Za-z0-9_.-]*' BEGIN
  UPDATE sitemap_revisions SET revised_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE kind='profiles';
END;
CREATE TRIGGER sitemap_teams_update AFTER UPDATE ON teams
WHEN (OLD.slug IS NOT NEW.slug OR OLD.archived_at IS NOT NEW.archived_at OR OLD.created_at IS NOT NEW.created_at OR OLD.updated_at IS NOT NEW.updated_at)
 AND ((OLD.archived_at IS NULL AND LENGTH(TRIM(OLD.slug)) BETWEEN 3 AND 30 AND TRIM(OLD.slug) NOT GLOB '*[^A-Za-z0-9_.-]*') OR
      (NEW.archived_at IS NULL AND LENGTH(TRIM(NEW.slug)) BETWEEN 3 AND 30 AND TRIM(NEW.slug) NOT GLOB '*[^A-Za-z0-9_.-]*')) BEGIN
  INSERT INTO sitemap_category_revisions SELECT DISTINCT t.category,strftime('%Y-%m-%d %H:%M:%f','now') FROM templates t WHERE (OLD.slug IS NOT NEW.slug OR OLD.archived_at IS NOT NEW.archived_at) AND t.team_id=NEW.id AND +t.owner_type='team' AND +t.is_public=1 AND t.deleted_at IS NULL AND t.category IS NOT NULL AND TRIM(t.category)<>'' ON CONFLICT(category) DO UPDATE SET revised_at=excluded.revised_at;
  UPDATE sitemap_revisions SET revised_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE
    kind='profiles' OR
    ((OLD.slug IS NOT NEW.slug OR OLD.archived_at IS NOT NEW.archived_at) AND (
      (kind='templates' AND EXISTS (SELECT 1 FROM templates t WHERE t.team_id=NEW.id AND +t.owner_type='team' AND +t.is_public=1 AND t.deleted_at IS NULL)) OR
      (kind='categories' AND EXISTS (SELECT 1 FROM templates t WHERE t.team_id=NEW.id AND +t.owner_type='team' AND +t.is_public=1 AND t.deleted_at IS NULL AND t.category IS NOT NULL AND TRIM(t.category)<>''))
    ));
END;
CREATE TRIGGER sitemap_teams_delete AFTER DELETE ON teams
WHEN OLD.archived_at IS NULL AND LENGTH(TRIM(OLD.slug)) BETWEEN 3 AND 30 AND TRIM(OLD.slug) NOT GLOB '*[^A-Za-z0-9_.-]*' BEGIN
  UPDATE sitemap_revisions SET revised_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE kind='profiles';
END;

INSERT INTO sitemap_category_revisions(category, revised_at)
SELECT category, COALESCE(updated_at, created_at) FROM templates
 WHERE owner_type='team' AND team_id IS NOT NULL AND team_id<>'' AND is_public=1 AND deleted_at IS NULL
   AND category IS NOT NULL AND TRIM(category)<>''
ON CONFLICT(category) DO UPDATE SET revised_at=excluded.revised_at
 WHERE julianday(excluded.revised_at) > COALESCE(julianday(sitemap_category_revisions.revised_at), 0);

UPDATE sitemap_revisions SET revised_at=strftime('%Y-%m-%d %H:%M:%f','now');
