-- V15__add_template_versioning_trigger.sql
-- Auto-create template version records on any template table update
-- This ensures audit trail is maintained even for direct database modifications (datafixes)

-- Create function to handle template version creation on update
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
      NOW()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on template table updates
DROP TRIGGER IF EXISTS template_version_trigger ON notify.template;
CREATE TRIGGER template_version_trigger
  BEFORE UPDATE ON notify.template
  FOR EACH ROW
  EXECUTE FUNCTION notify.create_template_version_on_update();

-- Add comment documenting the trigger
COMMENT ON TRIGGER template_version_trigger ON notify.template IS
  'Automatically creates template_version record on any template table update.
   Ensures audit trail is maintained for direct database modifications (datafixes).
   Only creates new version if actual content changes (detects via IS DISTINCT FROM).';
