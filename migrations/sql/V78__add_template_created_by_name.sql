-- ============================================================================
-- Template created_by_name / updated_by_name
--
-- created_by and updated_by hold the stable identifier from the JWT, which for
-- IDIR is an opaque <guid>@azureidir. These columns hold a name a person can
-- read, the same as notify.feature_flag_history.created_by_name.
--
-- Rows that already exist stay NULL: the name was never recorded.
--
-- The version trigger already takes template_version.created_by from
-- template.updated_by; it now takes created_by_name from updated_by_name the
-- same way. The rest of the function is unchanged from V15.
-- ============================================================================
BEGIN;

ALTER TABLE notify.template ADD COLUMN created_by_name VARCHAR(200);

ALTER TABLE notify.template ADD COLUMN updated_by_name VARCHAR(200);

ALTER TABLE notify.template_version ADD COLUMN created_by_name VARCHAR(200);

COMMENT ON COLUMN notify.template.created_by_name IS 'Display name of the user who created the template (JWT display_name), at the time they created it. NULL if the token carried none.';

COMMENT ON COLUMN notify.template.updated_by_name IS 'Display name of the user who last updated the template (JWT display_name), at the time they updated it. NULL if the token carried none.';

COMMENT ON COLUMN notify.template_version.created_by_name IS 'Display name of the user who made this version (JWT display_name), at the time they made it. Copied from template.updated_by_name by the version trigger. NULL if the token carried none.';

CREATE OR REPLACE FUNCTION notify.create_template_version_on_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create a new version if the template content or metadata has actually changed
  IF (OLD.subject IS DISTINCT FROM NEW.subject OR
      OLD.body IS DISTINCT FROM NEW.body OR
      OLD.engine_code IS DISTINCT FROM NEW.engine_code OR
      OLD.channel_code IS DISTINCT FROM NEW.channel_code OR
      OLD.name IS DISTINCT FROM NEW.name OR
      OLD.description IS DISTINCT FROM NEW.description) THEN

    -- Get the next version number
    NEW.version := COALESCE((
      SELECT MAX(version) + 1
      FROM notify.template_version
      WHERE template_id = NEW.id
    ), 1);

    -- Insert version record
    INSERT INTO notify.template_version (
      id,
      template_id,
      version,
      name,
      description,
      channel_code,
      subject,
      body,
      engine_code,
      created_by,
      created_by_name,
      created_at
    ) VALUES (
      gen_random_uuid(),
      NEW.id,
      NEW.version,
      NEW.name,
      NEW.description,
      NEW.channel_code,
      NEW.subject,
      NEW.body,
      NEW.engine_code,
      COALESCE(NEW.updated_by, 'system'),
      NEW.updated_by_name,
      NOW()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
