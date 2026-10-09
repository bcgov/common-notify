-- Mail clients do not reliably render SVG, so emails reference a PNG rendition of each logo while
-- the frontend keeps the SVG in file_key.
ALTER TABLE notify.email_logo ADD COLUMN email_file_key VARCHAR(255);

COMMENT ON COLUMN notify.email_logo.email_file_key IS
  'Object key of the rendition used in emails (PNG). NULL falls back to file_key.';

UPDATE notify.email_logo
SET email_file_key = regexp_replace(file_key, '\.svg$', '.png')
WHERE source_code = 'SYSTEM'
  AND file_key LIKE '%.svg';
