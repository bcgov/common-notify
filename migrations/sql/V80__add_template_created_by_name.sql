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
-- same way.
--
-- Keep only the current and previous version of each template
--
-- The version trigger now removes anything older than the previous version as
-- it adds a new one, so the cleanup also covers direct database modifications
-- (datafixes). The rest of the function is unchanged from V15.
--
-- The newest two rows are found by position, not by version - 1, because version
-- numbers are not guaranteed to be contiguous. The newest row is always kept, so
-- the trigger's MAX(version) + 1 carries on numbering from where it was.
--
-- This permanently deletes the older template_version entries of existing templates.
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

    -- Remove anything older than the previous version
    DELETE FROM notify.template_version
    WHERE template_id = NEW.id
      AND version < (
        SELECT version
        FROM notify.template_version
        WHERE template_id = NEW.id
        ORDER BY version DESC
        OFFSET 1
        LIMIT 1
      );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DELETE FROM notify.template_version
WHERE id IN (
  SELECT id
  FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY template_id ORDER BY version DESC) AS position
    FROM notify.template_version
  ) ranked
  WHERE position > 2
);

COMMENT ON TABLE notify.template_version IS 'The current and previous version of each template. Older versions are removed by the version trigger.';

COMMENT ON TRIGGER template_version_trigger ON notify.template IS
  'Automatically creates template_version record on any template table update, including direct database modifications (datafixes).
   Only creates new version if actual content changes (detects via IS DISTINCT FROM).
   Removes versions older than the previous one, so template_version is not a full audit trail.';

COMMIT;
