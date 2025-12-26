-- Add slug column to templates table for SEO-friendly URLs
ALTER TABLE templates ADD COLUMN slug TEXT;

-- Create index for slug lookups
CREATE INDEX idx_templates_slug ON templates(slug);

-- Update existing templates with generated slugs
-- Using template ID suffix to ensure uniqueness
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