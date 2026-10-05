CREATE TABLE public_handles (
  handle TEXT PRIMARY KEY NOT NULL,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('user', 'team')),
  owner_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_public_handles_owner ON public_handles (owner_type, owner_id);

INSERT INTO public_handles (handle, owner_type, owner_id, created_at)
SELECT lower(trim(username)), 'user', id, strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM users WHERE username IS NOT NULL AND trim(username) <> '';
INSERT INTO public_handles (handle, owner_type, owner_id, created_at)
SELECT lower(trim(slug)), 'team', id, strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM teams WHERE slug IS NOT NULL AND trim(slug) <> '';

CREATE TRIGGER public_handles_users_insert AFTER INSERT ON users
WHEN NEW.username IS NOT NULL AND trim(NEW.username) <> '' BEGIN
  INSERT INTO public_handles (handle, owner_type, owner_id, created_at) VALUES (lower(trim(NEW.username)), 'user', NEW.id, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER public_handles_users_update AFTER UPDATE OF username ON users
WHEN OLD.username IS NOT NEW.username BEGIN
  DELETE FROM public_handles WHERE owner_type = 'user' AND owner_id = NEW.id;
  INSERT INTO public_handles (handle, owner_type, owner_id, created_at)
  SELECT lower(trim(NEW.username)), 'user', NEW.id, strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE NEW.username IS NOT NULL AND trim(NEW.username) <> '';
END;
CREATE TRIGGER public_handles_users_delete AFTER DELETE ON users BEGIN
  DELETE FROM public_handles WHERE owner_type = 'user' AND owner_id = OLD.id;
END;
CREATE TRIGGER public_handles_teams_insert AFTER INSERT ON teams
WHEN NEW.slug IS NOT NULL AND trim(NEW.slug) <> '' BEGIN
  INSERT INTO public_handles (handle, owner_type, owner_id, created_at) VALUES (lower(trim(NEW.slug)), 'team', NEW.id, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER public_handles_teams_update AFTER UPDATE OF slug ON teams
WHEN OLD.slug IS NOT NEW.slug BEGIN
  DELETE FROM public_handles WHERE owner_type = 'team' AND owner_id = NEW.id;
  INSERT INTO public_handles (handle, owner_type, owner_id, created_at)
  SELECT lower(trim(NEW.slug)), 'team', NEW.id, strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE NEW.slug IS NOT NULL AND trim(NEW.slug) <> '';
END;
CREATE TRIGGER public_handles_teams_delete AFTER DELETE ON teams BEGIN
  DELETE FROM public_handles WHERE owner_type = 'team' AND owner_id = OLD.id;
END;
