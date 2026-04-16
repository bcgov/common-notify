/**
 * Supported job queue names
 */
export enum QueueName {
  INGESTION = 'notification-ingestion',
  EMAIL_DELIVERY = 'email-delivery',
  SMS_DELIVERY = 'sms-delivery',
  MSG_APP_DELIVERY = 'msgapp-delivery',
}
