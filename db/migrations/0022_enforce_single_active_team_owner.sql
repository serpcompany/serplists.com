CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_active_owner_unique
  ON team_members(team_id)
  WHERE role = 'owner' AND status = 'active';
