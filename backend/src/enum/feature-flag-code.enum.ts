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
  // Bulk Notifications screen (ad-hoc CSV send). Off until complete, then enabled per tenant.
  BULK_NOTIFICATIONS = 'bulk_notifications',
  // Non-production guardrail: when enabled, every tenant in the environment can only send to
  // recipients on its own safelist. Enabled in PR/DEV/TEST, off in PROD.
  RECIPIENT_SAFELIST = 'recipient_safelist',
}
