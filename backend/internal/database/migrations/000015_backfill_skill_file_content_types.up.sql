UPDATE skill_versions
SET files = (
  SELECT jsonb_agg(
    CASE
      WHEN entry->>'contentType' = 'application/octet-stream' AND lower(entry->>'path') LIKE '%.md'
        THEN jsonb_set(entry, '{contentType}', '"text/markdown"')
      WHEN entry->>'contentType' = 'application/octet-stream' AND lower(entry->>'path') LIKE '%.txt'
        THEN jsonb_set(entry, '{contentType}', '"text/plain"')
      WHEN entry->>'contentType' = 'application/octet-stream' AND lower(entry->>'path') LIKE '%.json'
        THEN jsonb_set(entry, '{contentType}', '"application/json"')
      WHEN entry->>'contentType' = 'application/octet-stream' AND lower(entry->>'path') LIKE '%.yaml'
        THEN jsonb_set(entry, '{contentType}', '"text/yaml"')
      WHEN entry->>'contentType' = 'application/octet-stream' AND lower(entry->>'path') LIKE '%.yml'
        THEN jsonb_set(entry, '{contentType}', '"text/yaml"')
      WHEN entry->>'contentType' = 'application/octet-stream' AND lower(entry->>'path') LIKE '%.js'
        THEN jsonb_set(entry, '{contentType}', '"text/javascript"')
      WHEN entry->>'contentType' = 'application/octet-stream' AND lower(entry->>'path') LIKE '%.ts'
        THEN jsonb_set(entry, '{contentType}', '"text/plain"')
      WHEN entry->>'contentType' = 'application/octet-stream' AND lower(entry->>'path') LIKE '%.py'
        THEN jsonb_set(entry, '{contentType}', '"text/x-python-script"')
      WHEN entry->>'contentType' = 'application/octet-stream' AND lower(entry->>'path') LIKE '%.sh'
        THEN jsonb_set(entry, '{contentType}', '"text/plain"')
      ELSE entry
    END
  )
  FROM jsonb_array_elements(skill_versions.files) AS entry
)
WHERE EXISTS (
  SELECT 1
  FROM jsonb_array_elements(skill_versions.files) AS entry
  WHERE entry->>'contentType' = 'application/octet-stream'
);
