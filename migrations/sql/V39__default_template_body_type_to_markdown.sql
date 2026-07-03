ALTER TABLE notify.template
ALTER COLUMN body_type SET DEFAULT 'markdown';

UPDATE notify.template
SET body_type = 'markdown'
WHERE body_type = 'html';

ALTER TABLE notify.template_version
ALTER COLUMN body_type SET DEFAULT 'markdown';

UPDATE notify.template_version
SET body_type = 'markdown'
WHERE body_type = 'html';
