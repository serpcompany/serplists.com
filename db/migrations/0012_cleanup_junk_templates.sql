-- Remove junk templates created by automated tests or manual API smoke runs.
DELETE FROM templates
WHERE title IN ('Test Template', 'Updated Template Title');
