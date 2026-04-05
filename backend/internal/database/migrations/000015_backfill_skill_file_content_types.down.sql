UPDATE skill_versions
SET files = (
  SELECT jsonb_agg(
    CASE
      WHEN entry->>'contentType' IN (
        'text/markdown',
        'text/plain',
        'application/json',
        'text/yaml',
        'text/javascript',
        'text/x-python-script'
      ) AND lower(entry->>'path') ~ '\\.(md|txt|json|yaml|yml|js|ts|py|sh)$'
        THEN jsonb_set(entry, '{contentType}', '"application/octet-stream"')
      ELSE entry
    END
  )
  FROM jsonb_array_elements(skill_versions.files) AS entry
)
WHERE EXISTS (
  SELECT 1
  FROM jsonb_array_elements(skill_versions.files) AS entry
  WHERE entry->>'contentType' = 'application/octet-stream'
     OR (
       entry->>'contentType' IN (
         'text/markdown',
         'text/plain',
         'application/json',
         'text/yaml',
         'text/javascript',
         'text/x-python-script'
       )
       AND lower(entry->>'path') ~ '\\.(md|txt|json|yaml|yml|js|ts|py|sh)$'
     )
);
