-- Rename seeded test users to make dev/test role labels explicit.
UPDATE users
SET name = CASE id
  WHEN 'user-1' THEN 'Admin (Pro)'
  WHEN 'user-2' THEN 'John (Free)'
  WHEN 'user-3' THEN 'Jane (Pro)'
  WHEN 'user-4' THEN 'Bob (Free)'
  ELSE name
END
WHERE id IN ('user-1', 'user-2', 'user-3', 'user-4');
