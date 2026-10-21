-- ============================================================================
-- International SMS Feature Flag
--
-- Gates SMS to numbers outside Canada. Canada shares +1 with the rest of the
-- North American Numbering Plan and is told apart by area code; every other
-- region, including the US, Puerto Rico, Jamaica, ..., is international.
--
-- With the flag off, international numbers are rejected for every tenant and the
-- International SMS switch is hidden from SMS settings. With it on, the switch is
-- shown and the tenant's international_sms_enabled (V49) decides.
-- ============================================================================
BEGIN;

INSERT INTO
  notify.feature_flag_code (
    code,
    display_name,
    description,
    sort_order,
    created_by,
    updated_by
  )
VALUES
  (
    'international_sms',
    'International SMS',
    'When enabled, tenants may turn on SMS to numbers outside Canada in their SMS settings. When disabled, those numbers are rejected for every tenant.',
    60,
    'migration',
    'migration'
  ) ON CONFLICT (code) DO NOTHING;

INSERT INTO
  notify.feature_flag (code, enabled, tenant_id, created_by, updated_by)
VALUES
  (
    'international_sms',
    FALSE,
    NULL,
    'migration',
    'migration'
  ) ON CONFLICT (code, tenant_id) DO NOTHING;

COMMIT;
