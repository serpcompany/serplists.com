-- Cleanup seed/test data inserted by `migrations/seed-test-data.sql`.
-- Safe target: only users with ids `user-1..user-4` and/or emails ending in `@test.com`.

-- Preview counts
SELECT 'users' AS table_name, COUNT(*) AS count
FROM users
WHERE id IN ('user-1', 'user-2', 'user-3', 'user-4') OR email LIKE '%@test.com';

SELECT 'templates' AS table_name, COUNT(*) AS count
FROM templates
WHERE user_id IN ('user-1', 'user-2', 'user-3', 'user-4');

SELECT 'checklist_runs' AS table_name, COUNT(*) AS count
FROM checklist_runs
WHERE user_id IN ('user-1', 'user-2', 'user-3', 'user-4');

SELECT 'template_likes' AS table_name, COUNT(*) AS count
FROM template_likes
WHERE user_id IN ('user-1', 'user-2', 'user-3', 'user-4')
   OR template_id IN ('template-1', 'template-2', 'template-3', 'template-4', 'template-5');

SELECT 'usage_analytics' AS table_name, COUNT(*) AS count
FROM usage_analytics
WHERE user_id IN ('user-1', 'user-2', 'user-3', 'user-4');

-- Delete children first (works regardless of FK enforcement)
DELETE FROM checklist_runs
WHERE user_id IN ('user-1', 'user-2', 'user-3', 'user-4');

DELETE FROM template_likes
WHERE user_id IN ('user-1', 'user-2', 'user-3', 'user-4')
   OR template_id IN ('template-1', 'template-2', 'template-3', 'template-4', 'template-5');

DELETE FROM usage_analytics
WHERE user_id IN ('user-1', 'user-2', 'user-3', 'user-4');

DELETE FROM templates
WHERE id IN ('template-1', 'template-2', 'template-3', 'template-4', 'template-5')
   OR user_id IN ('user-1', 'user-2', 'user-3', 'user-4');

DELETE FROM users
WHERE id IN ('user-1', 'user-2', 'user-3', 'user-4') OR email LIKE '%@test.com';

-- Post-check counts
SELECT 'users_after' AS table_name, COUNT(*) AS count
FROM users
WHERE id IN ('user-1', 'user-2', 'user-3', 'user-4') OR email LIKE '%@test.com';

