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
    WHEN node.key IN ('items', 'contents', 'subItems', 'fields', 'options') THEN 'expected an array, found ' || node.type
    WHEN node.key IN ('title', 'description', 'notes', 'value', 'fileName', 'uploadType', 'label', 'kind') THEN 'expected text, found ' || node.type
    WHEN node.key IN ('isCompleted', 'completed', 'required') THEN 'expected true or false, found ' || node.type
    WHEN node.key IN ('fileSize', 'min', 'max') THEN 'expected a number, found ' || node.type
    WHEN node.path LIKE '%.answer' THEN 'expected text, found ' || node.type
    WHEN node.type <> 'object' THEN 'expected an object, found ' || node.type
    WHEN node.path LIKE '%.fields'
      AND COALESCE(json_extract(node.value, '$.kind'), '') NOT IN ('text', 'longText', 'url', 'email', 'number', 'date', 'select', 'multiSelect', 'checkbox', 'file')
      THEN 'unknown or missing form field kind'
    WHEN node.path LIKE '%.fields' THEN 'answer does not fit the form field kind'
    ELSE 'unknown or missing content type'
  END AS problem
FROM content, json_tree(content.items) AS node
WHERE json_valid(content.items)
  AND (
    (node.parent IS NULL AND node.type <> 'array')
    OR (node.key IN ('items', 'contents', 'subItems', 'fields', 'options') AND node.type NOT IN ('array', 'null'))
    OR (node.key IN ('title', 'description', 'notes', 'value', 'fileName', 'uploadType', 'label', 'kind') AND node.type NOT IN ('text', 'null'))
    OR (node.key IN ('isCompleted', 'completed', 'required') AND node.type NOT IN ('true', 'false', 'null'))
    OR (node.key IN ('fileSize', 'min', 'max') AND node.type NOT IN ('integer', 'real', 'null'))
    OR (node.path LIKE '%.answer' AND typeof(node.key) = 'integer' AND node.type <> 'text')
    OR (
      node.parent IS NOT NULL
      AND (
        node.path = '$'
        OR node.path LIKE '%.items'
        OR node.path LIKE '%.contents'
        OR node.path LIKE '%.subItems'
        OR node.path LIKE '%.fields'
        OR node.path LIKE '%.options'
      )
      AND node.type <> 'object'
    )
    OR (
      node.path LIKE '%.contents'
      AND node.type = 'object'
      AND COALESCE(json_extract(node.value, '$.type'), '') NOT IN ('text', 'image', 'video', 'file', 'embed', 'subItems', 'form')
    )
    OR (
      node.path LIKE '%.fields'
      AND node.type = 'object'
      AND (
        COALESCE(json_extract(node.value, '$.kind'), '') NOT IN ('text', 'longText', 'url', 'email', 'number', 'date', 'select', 'multiSelect', 'checkbox', 'file')
        OR (
          json_extract(node.value, '$.kind') IN ('text', 'longText', 'url', 'email', 'date', 'select')
          AND COALESCE(json_type(node.value, '$.answer'), 'null') NOT IN ('text', 'null')
        )
        OR (json_extract(node.value, '$.kind') = 'number' AND COALESCE(json_type(node.value, '$.answer'), 'null') NOT IN ('integer', 'real', 'null'))
        OR (json_extract(node.value, '$.kind') = 'multiSelect' AND COALESCE(json_type(node.value, '$.answer'), 'null') NOT IN ('array', 'null'))
        OR (json_extract(node.value, '$.kind') = 'checkbox' AND COALESCE(json_type(node.value, '$.answer'), 'null') NOT IN ('true', 'false', 'null'))
        OR (
          json_extract(node.value, '$.kind') = 'file'
          AND COALESCE(json_type(node.value, '$.answer'), 'null') <> 'null'
          AND (json_type(node.value, '$.answer') <> 'object' OR COALESCE(json_type(node.value, '$.answer.url'), 'null') <> 'text')
        )
      )
    )
  )
ORDER BY 1, 2, 3;
