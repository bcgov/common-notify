-- Add MJML template engine code for responsive email templates
INSERT INTO
  notify.template_engine_code (
    engine_code,
    description,
    display_name,
    created_by,
    updated_by
  )
VALUES
  (
    'mjml',
    'MJML template engine for responsive email templates',
    'MJML',
    'migration',
    'migration'
  ) ON CONFLICT (engine_code) DO NOTHING;
