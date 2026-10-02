ALTER TABLE templates ADD COLUMN slug TEXT;

CREATE INDEX idx_templates_slug ON templates(slug);

UPDATE templates 
SET slug = LOWER(
  REPLACE(
    REPLACE(
      REPLACE(
        REPLACE(
          REPLACE(title, ' ', '-'),
          '&', 'and'
        ),
        ',', ''
      ),
      '.', ''
    ),
    '/', '-'
  )
) || '-' || substr(id, 1, 8)
WHERE slug IS NULL;