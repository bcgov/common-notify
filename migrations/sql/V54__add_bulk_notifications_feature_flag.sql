-- ============================================================================
-- Bulk Notifications Feature Flag
-- Purpose: Gate the Bulk Notifications screen (CCP-5599) while it is being built.
-- Seeded OFF globally; enable per tenant to expose the sidebar entry.
-- ============================================================================
BEGIN;

INSERT INTO
  notify.feature_flag_code (
    code,
    display_name,
    description,
    created_by,
    updated_by
  )
VALUES
  (
    'bulk_notifications',
    'Bulk Notifications',
    'When enabled, tenant users can send an ad-hoc email notification to a list of recipients uploaded as a CSV file.',
    'migration',
    'migration'
  ) ON CONFLICT (code) DO NOTHING;

INSERT INTO
  notify.feature_flag (code, enabled, tenant_id, created_by, updated_by)
VALUES
  ('bulk_notifications', FALSE, NULL, 'migration', 'migration') ON CONFLICT (code, tenant_id) DO NOTHING;

COMMIT;
