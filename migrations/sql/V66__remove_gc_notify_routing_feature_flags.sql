-- ============================================================================
-- Remove the GC Notify Routing Feature Flags
--
-- These six flags chose, per tenant and per endpoint, whether a GC Notify-compatible
-- request executed internally through our own pipeline or was passed through to the
-- real GC Notify API (V41).
--
-- The passthrough side is no longer wanted. These routes exist to give applications
-- migrating off GC Notify a compatible surface: they point at Notify with a
-- Notify-issued API key, and Notify answers in GC Notify's shapes. Passthrough
-- forwards the caller's Authorization header verbatim to api.notification.canada.ca,
-- so it can only ever work for a caller still holding a real GC Notify key - the
-- opposite of the audience these routes are for. Every operation now executes
-- internally, unconditionally, and there is nothing left to gate.
--
-- Bulk send (POST /gcnotify/v2/notifications/bulk) was never covered by a flag and is
-- still passthrough-only, pending a native mail-merge job runner. It is unaffected.
--
-- Order matters: feature_flag.code is a foreign key to feature_flag_code.code, so the
-- instances go first.
-- ============================================================================
BEGIN;

DELETE FROM notify.feature_flag
WHERE
  code IN (
    'gc_notify_route_email',
    'gc_notify_route_sms',
    'gc_notify_route_get_notification',
    'gc_notify_route_list_notifications',
    'gc_notify_route_get_template',
    'gc_notify_route_list_templates'
  );

DELETE FROM notify.feature_flag_code
WHERE
  code IN (
    'gc_notify_route_email',
    'gc_notify_route_sms',
    'gc_notify_route_get_notification',
    'gc_notify_route_list_notifications',
    'gc_notify_route_get_template',
    'gc_notify_route_list_templates'
  );

COMMIT;
