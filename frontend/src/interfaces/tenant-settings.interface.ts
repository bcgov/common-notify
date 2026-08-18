/** The Tenant tab fields, which are also the PATCH payload for the tenant settings route. */
export interface TenantSettingsValues {
  alertEmail: string | null
  defaultSenderEmail: string | null
}

/** The SMS tab fields, which are also the PATCH payload for the SMS settings route. */
export interface SmsSettingsValues {
  smsNotificationsEnabled: boolean
  includeTenantNameInSms: boolean
  internationalSmsEnabled: boolean
}

/** The Email tab fields, which are also the PATCH payload for the email settings route. */
export interface EmailSettingsValues {
  emailNotificationsEnabled: boolean
  replyToEmail: string | null
  emailAttachmentsEnabled: boolean
}

/** The whole tenant_settings row, as returned by GET /api/v1/frontend/tenant-settings. */
export interface TenantSettings
  extends TenantSettingsValues, SmsSettingsValues, EmailSettingsValues {
  id: string
  tenantId: string
  createdAt: string
  createdBy: string | null
  updatedAt: string
  updatedBy: string | null
  isDeleted: boolean
}
