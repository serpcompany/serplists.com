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
