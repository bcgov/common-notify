-- ============================================================================
-- Dashboard Feature Flag
-- Purpose: Gate the Dashboard screen (CCP-6282).
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
    'dashboard',
    'Dashboard',
    'When enabled, tenant users can access the Dashboard screen.',
    'migration',
    'migration'
  ) ON CONFLICT (code) DO NOTHING;

INSERT INTO
  notify.feature_flag (code, enabled, tenant_id, created_by, updated_by)
-- The V27 unique constraint on (code, tenant_id) allows multiple NULL tenant IDs.
-- Preserve any existing global flag, including one created manually.
SELECT
  'dashboard', FALSE, NULL, 'migration', 'migration'
WHERE
  NOT EXISTS (
    SELECT 1
    FROM notify.feature_flag
    WHERE code = 'dashboard' AND tenant_id IS NULL
  );

COMMIT;
