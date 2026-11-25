-- ============================================================================
-- Notification Priority Feature Flag
--
-- Gates the optional priority (high, normal, low) on a send request. With the
-- flag off, a requested priority is ignored and the send is queued at the
-- default: normal, or low for a merge. Seeded OFF globally; enable globally or
-- per tenant to let callers choose a priority.
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
    'notification_priority',
    'Notification Priority',
    'When enabled, a send request may set a priority (high, normal or low). When disabled, a requested priority is ignored and the default is used.',
    70,
    'migration',
    'migration'
  ) ON CONFLICT (code) DO NOTHING;

INSERT INTO
  notify.feature_flag (code, enabled, tenant_id, created_by, updated_by)
-- The V27 unique constraint on (code, tenant_id) allows multiple NULL tenant IDs.
-- Preserve any existing global flag, including one created manually.
SELECT
  'notification_priority', FALSE, NULL, 'migration', 'migration'
WHERE
  NOT EXISTS (
    SELECT 1
    FROM notify.feature_flag
    WHERE code = 'notification_priority' AND tenant_id IS NULL
  );

COMMIT;
