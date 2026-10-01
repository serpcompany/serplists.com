ALTER TABLE templates ADD COLUMN content_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE checklist_runs ADD COLUMN template_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE checklist_runs ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE checklist_runs ADD COLUMN retired_items TEXT NOT NULL DEFAULT '[]';

UPDATE templates SET content_version = version + 1, version = version + 1;

UPDATE templates
SET items = json_array(json_object('id', '1', 'title', 'Checklist', 'items', json(items)))
WHERE json_valid(items)
  AND json_type(items) = 'array'
  AND json_array_length(items) > 0
  AND json_type(items, '$[0].items') IS NULL;

UPDATE templates
SET items = (
  WITH RECURSIVE
  patches AS (
    SELECT row_number() OVER (ORDER BY path) AS patch_number, path, stable_id
    FROM (
      SELECT '$[' || section.key || '].id' AS path,
             'legacy-section-' || (CAST(section.key AS INTEGER) + 1) AS stable_id
      FROM json_each(templates.items) AS section
      WHERE COALESCE(NULLIF(json_extract(section.value, '$.id'), ''), '') = ''
      UNION ALL
      SELECT '$[' || section.key || '].items[' || item.key || '].id',
             'legacy-item-' || (CAST(section.key AS INTEGER) + 1) || '-' || (CAST(item.key AS INTEGER) + 1)
      FROM json_each(templates.items) AS section
      JOIN json_each(section.value, '$.items') AS item
      WHERE COALESCE(NULLIF(json_extract(item.value, '$.id'), ''), '') = ''
      UNION ALL
      SELECT '$[' || section.key || '].items[' || item.key || '].subItems[' || sub_item.key || '].id',
             'legacy-subitem-' || (CAST(section.key AS INTEGER) + 1) || '-' || (CAST(item.key AS INTEGER) + 1) || '-' || (CAST(sub_item.key AS INTEGER) + 1)
      FROM json_each(templates.items) AS section
      JOIN json_each(section.value, '$.items') AS item
      JOIN json_each(item.value, '$.subItems') AS sub_item
      WHERE COALESCE(NULLIF(json_extract(sub_item.value, '$.id'), ''), '') = ''
      UNION ALL
      SELECT '$[' || section.key || '].items[' || item.key || '].contents[' || content.key || '].subItems[' || sub_item.key || '].id',
             'legacy-subitem-' || (CAST(section.key AS INTEGER) + 1) || '-' || (CAST(item.key AS INTEGER) + 1) || '-' ||
               ((SELECT COUNT(*) FROM json_each(item.value, '$.subItems')) + (SELECT COUNT(*)
                FROM json_each(item.value, '$.contents') AS prior_content
                JOIN json_each(prior_content.value, '$.subItems') AS prior_sub_item
                WHERE CAST(prior_content.key AS INTEGER) < CAST(content.key AS INTEGER)
                   OR (prior_content.key = content.key AND CAST(prior_sub_item.key AS INTEGER) <= CAST(sub_item.key AS INTEGER))))
      FROM json_each(templates.items) AS section
      JOIN json_each(section.value, '$.items') AS item
      JOIN json_each(item.value, '$.contents') AS content
      JOIN json_each(content.value, '$.subItems') AS sub_item
      WHERE COALESCE(NULLIF(json_extract(sub_item.value, '$.id'), ''), '') = ''
    )
  ),
  rebuilt(patch_number, value) AS (
    SELECT 0, templates.items
    UNION ALL
    SELECT rebuilt.patch_number + 1,
           json_set(rebuilt.value, patches.path, patches.stable_id)
    FROM rebuilt
    JOIN patches ON patches.patch_number = rebuilt.patch_number + 1
  )
  SELECT value FROM rebuilt ORDER BY patch_number DESC LIMIT 1
)
WHERE json_valid(items) AND json_type(items) = 'array';

UPDATE checklist_runs
SET items = json_array(json_object('id', '1', 'title', 'Checklist', 'items', json(items)))
WHERE json_valid(items)
  AND json_type(items) = 'array'
  AND json_array_length(items) > 0
  AND json_type(items, '$[0].items') IS NULL;

UPDATE checklist_runs
SET items = (
  WITH RECURSIVE
  patches AS (
    SELECT row_number() OVER (ORDER BY path) AS patch_number, path, stable_id
    FROM (
      SELECT '$[' || section.key || '].id' AS path,
             'legacy-section-' || (CAST(section.key AS INTEGER) + 1) AS stable_id
      FROM json_each(checklist_runs.items) AS section
      WHERE COALESCE(NULLIF(json_extract(section.value, '$.id'), ''), '') = ''
      UNION ALL
      SELECT '$[' || section.key || '].items[' || item.key || '].id',
             'legacy-item-' || (CAST(section.key AS INTEGER) + 1) || '-' || (CAST(item.key AS INTEGER) + 1)
      FROM json_each(checklist_runs.items) AS section
      JOIN json_each(section.value, '$.items') AS item
      WHERE COALESCE(NULLIF(json_extract(item.value, '$.id'), ''), '') = ''
      UNION ALL
      SELECT '$[' || section.key || '].items[' || item.key || '].subItems[' || sub_item.key || '].id',
             'legacy-subitem-' || (CAST(section.key AS INTEGER) + 1) || '-' || (CAST(item.key AS INTEGER) + 1) || '-' || (CAST(sub_item.key AS INTEGER) + 1)
      FROM json_each(checklist_runs.items) AS section
      JOIN json_each(section.value, '$.items') AS item
      JOIN json_each(item.value, '$.subItems') AS sub_item
      WHERE COALESCE(NULLIF(json_extract(sub_item.value, '$.id'), ''), '') = ''
      UNION ALL
      SELECT '$[' || section.key || '].items[' || item.key || '].contents[' || content.key || '].subItems[' || sub_item.key || '].id',
             'legacy-subitem-' || (CAST(section.key AS INTEGER) + 1) || '-' || (CAST(item.key AS INTEGER) + 1) || '-' ||
               ((SELECT COUNT(*) FROM json_each(item.value, '$.subItems')) + (SELECT COUNT(*)
                FROM json_each(item.value, '$.contents') AS prior_content
                JOIN json_each(prior_content.value, '$.subItems') AS prior_sub_item
                WHERE CAST(prior_content.key AS INTEGER) < CAST(content.key AS INTEGER)
                   OR (prior_content.key = content.key AND CAST(prior_sub_item.key AS INTEGER) <= CAST(sub_item.key AS INTEGER))))
      FROM json_each(checklist_runs.items) AS section
      JOIN json_each(section.value, '$.items') AS item
      JOIN json_each(item.value, '$.contents') AS content
      JOIN json_each(content.value, '$.subItems') AS sub_item
      WHERE COALESCE(NULLIF(json_extract(sub_item.value, '$.id'), ''), '') = ''
    )
  ),
  rebuilt(patch_number, value) AS (
    SELECT 0, checklist_runs.items
    UNION ALL
    SELECT rebuilt.patch_number + 1,
           json_set(rebuilt.value, patches.path, patches.stable_id)
    FROM rebuilt
    JOIN patches ON patches.patch_number = rebuilt.patch_number + 1
  )
  SELECT value FROM rebuilt ORDER BY patch_number DESC LIMIT 1
)
WHERE json_valid(items) AND json_type(items) = 'array';

UPDATE checklist_runs SET template_version = 0 WHERE template_id IS NOT NULL;
