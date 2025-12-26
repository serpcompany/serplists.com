-- NOTE:
-- If you're trying to remove the seed/test data shipped in `migrations/seed-test-data.sql`,
-- use `migrations/cleanup-seed-data.sql` (or `pnpm run db:cleanup:local|remote`).
--
-- This file is a separate, title-based cleanup script for ad-hoc dummy templates.

-- First, let's see what we're going to delete (run this part first to preview)
SELECT 
    'PREVIEW - Templates to be deleted:' as message;
SELECT 
    id,
    title,
    description,
    user_id,
    created_at,
    is_public
FROM templates 
WHERE title IN ('Updated Template Title', 'Test Template', 'Untitled Template');

-- Check if any checklist runs reference these templates
SELECT 
    'PREVIEW - Checklist runs that will have template_id set to NULL:' as message;
SELECT 
    cr.id,
    cr.title,
    cr.template_id,
    t.title as template_title,
    cr.user_id,
    cr.status
FROM checklist_runs cr
JOIN templates t ON cr.template_id = t.id
WHERE t.title IN ('Updated Template Title', 'Test Template', 'Untitled Template');

-- Uncomment the lines below to actually perform the deletion:

-- Delete the dummy templates (foreign key constraint will set template_id to NULL in checklist_runs)
-- DELETE FROM templates 
-- WHERE title IN ('Updated Template Title', 'Test Template', 'Untitled Template');

-- Show confirmation of what was deleted
-- SELECT 'Cleanup completed. Deleted templates with dummy titles.' as result;
