-- Add slugs to existing templates that don't have them
-- This script generates SEO-friendly slugs from template titles

-- For SQLite, we need to update each template individually
-- Since SQLite doesn't support complex string functions, we'll do basic slug generation

-- Update templates with NULL or empty slugs
-- This creates a basic slug from the title (lowercase, spaces to hyphens)
UPDATE templates 
SET slug = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(title, ' ', '-'), '&', 'and'), ',', ''), '.', '')) || '-' || substr(id, 1, 8)
WHERE slug IS NULL OR slug = '';

-- Examples of what this generates:
-- "Ultimate Camping Checklist" -> "ultimate-camping-checklist-d2f53738"
-- "Wedding Planning Guide" -> "wedding-planning-guide-a1b2c3d4"