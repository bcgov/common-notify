-- V56: Configuration that turns the V48/V49 event feature on.
--
--   1. configuration 'event_max_recipients' - global cap on manually entered recipients per
--                                             event channel.
--   2. feature flag 'events'                - global kill switch, default FALSE.
--
-- Defaults are chosen so this migration changes no existing behaviour: the feature flag starts
-- off, so the Events UI and the event tables are unreachable until it is switched on.
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Global recipient cap (same pattern as safelist_max_entries in V46)
-- ---------------------------------------------------------------------------
INSERT INTO
  notify.configuration (key, config, created_by, updated_by)
VALUES
  (
    'event_max_recipients',
    '{"value": 100, "type": "number", "description": "Maximum number of manually entered recipients per event channel (email or SMS tab)."}'::JSONB,
    'system',
    'system'
  ) ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Feature flag (global kill switch)
-- ---------------------------------------------------------------------------
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
    'events',
    'Events',
    'Master switch for tenant-configured events. When disabled the Events UI is hidden and events are not dispatched, regardless of per-event active flags.',
    40,
    'migration',
    'migration'
  ) ON CONFLICT (code) DO NOTHING;

INSERT INTO
  notify.feature_flag (code, enabled, tenant_id, created_by, updated_by)
VALUES
  (
    'events',
    FALSE,
    NULL,
    'migration',
    'migration'
  ) ON CONFLICT (code, tenant_id) DO NOTHING;

COMMIT;
