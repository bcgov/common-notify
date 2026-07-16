ALTER TABLE notify.template
ALTER COLUMN body_type DROP NOT NULL;

ALTER TABLE notify.template_version
ALTER COLUMN body_type DROP NOT NULL;
