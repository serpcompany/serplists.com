-- Ensure template slugs are unique.
-- If duplicates exist, suffix the later ones with a stable id fragment.

WITH duplicate_slugs AS (
  SELECT slug
  FROM templates
  WHERE slug IS NOT NULL
  GROUP BY slug
  HAVING COUNT(*) > 1
),
ranked AS (
  SELECT
    id,
    slug,
    ROW_NUMBER() OVER (PARTITION BY slug ORDER BY created_at, id) AS rn
  FROM templates
  WHERE slug IN (SELECT slug FROM duplicate_slugs)
)
UPDATE templates
SET slug = slug || '-' || substr(id, 1, 8)
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS idx_templates_slug_unique ON templates(slug);

