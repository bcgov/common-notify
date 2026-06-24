-- ============================================================================
-- GC Notify Endpoint-Level Execution Routing Feature Flags
-- Purpose: Add per-tenant toggles that switch a GC Notify-compatible operation
-- from passthrough (relay to the real GC Notify API) to internal execution
-- (our own Notify pipeline). Defaults to passthrough (disabled) everywhere
-- until a tenant override is added.
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
    'gc_notify_route_email',
    'GC Notify: Internal Email Send',
    'When enabled, POST /v2/notifications/email executes via our own Notify pipeline instead of passing through to the real GC Notify API.',
    'migration',
    'migration'
  ),
  (
    'gc_notify_route_sms',
    'GC Notify: Internal SMS Send',
    'When enabled, POST /v2/notifications/sms executes via our own Notify pipeline instead of passing through to the real GC Notify API.',
    'migration',
    'migration'
  ),
  (
    'gc_notify_route_get_notification',
    'GC Notify: Internal Get Notification',
    'When enabled, GET /v2/notifications/{id} reads from our own database instead of passing through to the real GC Notify API.',
    'migration',
    'migration'
  ),
  (
    'gc_notify_route_list_notifications',
    'GC Notify: Internal List Notifications',
    'When enabled, GET /v2/notifications reads from our own database instead of passing through to the real GC Notify API.',
    'migration',
    'migration'
  ),
  (
    'gc_notify_route_get_template',
    'GC Notify: Internal Get Template',
    'When enabled, GET /v2/template/{id} reads from our own database instead of passing through to the real GC Notify API.',
    'migration',
    'migration'
  ),
  (
    'gc_notify_route_list_templates',
    'GC Notify: Internal List Templates',
    'When enabled, GET /v2/templates reads from our own database instead of passing through to the real GC Notify API.',
    'migration',
    'migration'
  ) ON CONFLICT (code) DO NOTHING;

-- Seed global flags, all defaulted OFF (passthrough) until a tenant is migrated.
INSERT INTO
  notify.feature_flag (code, enabled, tenant_id, created_by, updated_by)
VALUES
  ('gc_notify_route_email', FALSE, NULL, 'migration', 'migration'),
  ('gc_notify_route_sms', FALSE, NULL, 'migration', 'migration'),
  ('gc_notify_route_get_notification', FALSE, NULL, 'migration', 'migration'),
  ('gc_notify_route_list_notifications', FALSE, NULL, 'migration', 'migration'),
  ('gc_notify_route_get_template', FALSE, NULL, 'migration', 'migration'),
  ('gc_notify_route_list_templates', FALSE, NULL, 'migration', 'migration') ON CONFLICT (code, tenant_id) DO NOTHING;

COMMIT;
