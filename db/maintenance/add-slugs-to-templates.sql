UPDATE templates 
SET slug = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(title, ' ', '-'), '&', 'and'), ',', ''), '.', '')) || '-' || substr(id, 1, 8)
WHERE slug IS NULL OR slug = '';
