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
}
