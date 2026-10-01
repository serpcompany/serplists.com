WITH content AS (
  SELECT 'templates' AS source, id, items FROM templates
  UNION ALL
  SELECT 'checklist_runs' AS source, id, items FROM checklist_runs
)
SELECT content.source, content.id, '$' AS path, 'invalid JSON' AS problem
FROM content
WHERE content.items IS NOT NULL AND NOT json_valid(content.items)
UNION ALL
SELECT
  content.source,
  content.id,
  node.fullkey AS path,
  CASE
    WHEN node.parent IS NULL THEN 'expected an array, found ' || node.type
    WHEN node.key IN ('items', 'contents', 'subItems') THEN 'expected an array, found ' || node.type
    WHEN node.key IN ('title', 'description', 'notes', 'value', 'fileName', 'uploadType') THEN 'expected text, found ' || node.type
    WHEN node.key IN ('isCompleted', 'completed') THEN 'expected true or false, found ' || node.type
    WHEN node.key = 'fileSize' THEN 'expected a number, found ' || node.type
    WHEN node.type <> 'object' THEN 'expected an object, found ' || node.type
    ELSE 'unknown or missing content type'
  END AS problem
FROM content, json_tree(content.items) AS node
WHERE json_valid(content.items)
  AND (
    (node.parent IS NULL AND node.type <> 'array')
    OR (node.key IN ('items', 'contents', 'subItems') AND node.type NOT IN ('array', 'null'))
    OR (node.key IN ('title', 'description', 'notes', 'value', 'fileName', 'uploadType') AND node.type NOT IN ('text', 'null'))
    OR (node.key IN ('isCompleted', 'completed') AND node.type NOT IN ('true', 'false', 'null'))
    OR (node.key = 'fileSize' AND node.type NOT IN ('integer', 'real', 'null'))
    OR (
      node.parent IS NOT NULL
      AND (node.path = '$' OR node.path LIKE '%.items' OR node.path LIKE '%.contents' OR node.path LIKE '%.subItems')
      AND node.type <> 'object'
    )
    OR (
      node.path LIKE '%.contents'
      AND node.type = 'object'
      AND COALESCE(json_extract(node.value, '$.type'), '') NOT IN ('text', 'image', 'video', 'file', 'embed', 'subItems')
    )
  )
ORDER BY 1, 2, 3;
