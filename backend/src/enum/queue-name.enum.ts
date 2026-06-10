/**
 * Supported job queue names
 */
export enum QueueName {
  INGESTION = 'notification-ingestion',
  EMAIL_DELIVERY = 'email-delivery',
  SMS_DELIVERY = 'sms-delivery',
  WEBHOOK_DELIVERY = 'webhook-delivery',
}
