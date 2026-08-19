/**
 * Feature Flag Code Enum
 *
 * Defines all valid feature flag codes that can be used in the system.
 * Used with the @FeatureFlag() decorator to control feature gate access.
 */
export enum FeatureFlagCode {
  SMS_NOTIFICATIONS = 'sms_notifications',
  SSE_NOTIFICATIONS = 'sse_notifications',
  DASHBOARD = 'dashboard',
  EVENTS = 'events',
  // Endpoint-level execution routing for GC Notify-compatible routes: when enabled
  // (per tenant), the operation executes internally via our own Notify pipeline
  // instead of passing through to the real GC Notify API.
  GC_NOTIFY_ROUTE_EMAIL = 'gc_notify_route_email',
  GC_NOTIFY_ROUTE_SMS = 'gc_notify_route_sms',
  GC_NOTIFY_ROUTE_GET_NOTIFICATION = 'gc_notify_route_get_notification',
  GC_NOTIFY_ROUTE_LIST_NOTIFICATIONS = 'gc_notify_route_list_notifications',
  GC_NOTIFY_ROUTE_GET_TEMPLATE = 'gc_notify_route_get_template',
  GC_NOTIFY_ROUTE_LIST_TEMPLATES = 'gc_notify_route_list_templates',
  // Non-production guardrail: when enabled, every tenant in the environment can only send to
  // recipients on its own safelist. Enabled in PR/DEV/TEST, off in PROD.
  RECIPIENT_SAFELIST = 'recipient_safelist',
}
