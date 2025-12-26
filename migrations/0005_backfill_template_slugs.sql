-- Backfill missing/blank template slugs for legacy rows.
-- Uses a deterministic slug built from the title plus a stable id suffix to guarantee uniqueness.

UPDATE templates
SET slug = (
  CASE
    WHEN title IS NULL OR trim(title) = '' THEN 'template-' || substr(id, 1, 8)
    ELSE (
      lower(
        replace(
          replace(
            replace(
              replace(trim(title), ' ', '-'),
              '/', '-'
            ),
            '\\', '-'
          ),
          '_', '-'
        )
      ) || '-' || substr(id, 1, 8)
    )
  END
)
WHERE slug IS NULL OR trim(slug) = '';

