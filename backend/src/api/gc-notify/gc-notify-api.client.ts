import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { CreateEmailNotificationRequest } from './schemas/create-email-notification-request'
import type { CreateSmsNotificationRequest } from './schemas/create-sms-notification-request'
import type { NotificationResponse } from './schemas/notification-response'
import type { Notification } from './schemas/notification'
import type { Template } from './schemas/template'
import type { Links } from './schemas/links'
import type { PostBulkRequest } from './schemas/post-bulk-request'
import type { PostBulkResponse } from './schemas/post-bulk-response'
import type { FileAttachment } from './schemas/file-attachment'

interface GcNotifyErrorResponse {
  errors?: Array<{ error: string; message: string }>
  status_code?: number
}

@Injectable()
export class GcNotifyApiClient {
  private readonly logger = new Logger(GcNotifyApiClient.name)

  constructor(private readonly configService: ConfigService) {}

  private getBaseUrl(): string {
    const url = this.configService.get<string>('gcNotify.baseUrl')
    if (!url) {
      throw new Error('GC_NOTIFY_BASE_URL is required when using GC Notify passthrough mode')
    }
    return url.replace(/\/$/, '')
  }

  private async request<T>(
    method: string,
    path: string,
    authHeader: string,
    body?: unknown,
  ): Promise<T> {
    const baseUrl = this.getBaseUrl()
    const url = `${baseUrl}${path}`

    const headers: Record<string, string> = {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    }

    const options: RequestInit = {
      method,
      headers,
    }

    if (body && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body)
    }

    const response = await fetch(url, options)

    if (!response.ok) {
      const errBody = await response.text()
      let errData: GcNotifyErrorResponse | null = null
      try {
        errData = JSON.parse(errBody) as GcNotifyErrorResponse
      } catch {
        this.logger.debug(`GC Notify API returned non-JSON error body: ${errBody.slice(0, 100)}`)
      }

      const message = errData?.errors?.[0]?.message ?? errBody ?? response.statusText

      if (response.status === 400) {
        throw new BadRequestException(message)
      }
      if (response.status === 401 || response.status === 403) {
        throw new UnauthorizedException(message)
      }
      if (response.status === 404) {
        throw new NotFoundException(message)
      }
      if (response.status === 429) {
        throw new BadRequestException(`GC Notify API rate limit exceeded: ${message}`)
      }

      this.logger.error(`GC Notify API error: ${response.status} ${message}`)
      throw new BadRequestException(`GC Notify API error: ${response.status} - ${message}`)
    }

    if (response.status === 204) {
      return undefined as T
    }

    return (await response.json()) as T
  }

  private mapPersonalisation(
    personalisation?: Record<string, string | FileAttachment>,
  ):
    | Record<string, string | { file: string; filename: string; sending_method: 'attach' | 'link' }>
    | undefined {
    if (!personalisation || Object.keys(personalisation).length === 0) {
      return undefined
    }

    const result: Record<
      string,
      string | { file: string; filename: string; sending_method: 'attach' | 'link' }
    > = {}
    for (const [key, value] of Object.entries(personalisation)) {
      if (typeof value === 'string') {
        result[key] = value
      } else {
        result[key] = {
          file: value.file,
          filename: value.filename,
          sending_method: value.sending_method,
        }
      }
    }
    return result
  }

  async sendEmail(
    body: CreateEmailNotificationRequest,
    authHeader: string,
  ): Promise<NotificationResponse> {
    const payload = {
      email_address: body.email_address,
      template_id: body.template_id,
      personalisation: this.mapPersonalisation(body.personalisation),
      reference: body.reference,
      email_reply_to_id: body.email_reply_to_id,
    }

    const raw = await this.request<{
      id: string
      reference?: string
      content: { subject: string; body: string; from_email: string }
      uri: string
      template: { id: string; version: number; uri: string }
      scheduled_for?: string
    }>('POST', '/v2/notifications/email', authHeader, payload)

    return {
      id: raw.id,
      reference: raw.reference,
      content: {
        from_email: raw.content.from_email,
        body: raw.content.body,
        subject: raw.content.subject,
      },
      uri: `/api/gcnotify/v2/notifications/${raw.id}`,
      template: {
        id: raw.template.id,
        version: raw.template.version,
        uri: `/api/gcnotify/v2/templates/${raw.template.id}`,
      },
      scheduled_for: raw.scheduled_for ?? body.scheduled_for,
    }
  }

  async sendSms(
    body: CreateSmsNotificationRequest,
    authHeader: string,
  ): Promise<NotificationResponse> {
    const payload = {
      phone_number: body.phone_number,
      template_id: body.template_id,
      personalisation: body.personalisation,
      reference: body.reference,
      sms_sender_id: body.sms_sender_id,
    }

    const raw = await this.request<{
      id: string
      reference?: string
      content: { body: string; from_number: string }
      uri: string
      template: { id: string; version: number; uri: string }
      scheduled_for?: string
    }>('POST', '/v2/notifications/sms', authHeader, payload)

    return {
      id: raw.id,
      reference: raw.reference,
      content: {
        body: raw.content.body,
        from_number: raw.content.from_number,
      },
      uri: `/api/gcnotify/v2/notifications/${raw.id}`,
      template: {
        id: raw.template.id,
        version: raw.template.version,
        uri: `/api/gcnotify/v2/templates/${raw.template.id}`,
      },
      scheduled_for: raw.scheduled_for ?? body.scheduled_for,
    }
  }

  async getTemplates(
    type: 'sms' | 'email' | undefined,
    authHeader: string,
  ): Promise<{ templates: Template[] }> {
    const query = type ? `?type=${type}` : ''
    const raw = await this.request<{ templates: unknown[] }>(
      'GET',
      `/v2/templates${query}`,
      authHeader,
    )

    const templates: Template[] = (raw.templates ?? []).map((t) =>
      this.mapTemplate(t as Record<string, unknown>),
    )

    return { templates }
  }

  async getTemplate(templateId: string, authHeader: string): Promise<Template> {
    const raw = await this.request<Record<string, unknown>>(
      'GET',
      `/v2/template/${templateId}`,
      authHeader,
    )

    return this.mapTemplate(raw)
  }

  async getNotifications(
    query: {
      template_type?: 'sms' | 'email'
      status?: string[]
      reference?: string
      older_than?: string
      include_jobs?: boolean
    },
    authHeader: string,
  ): Promise<{ notifications: Notification[]; links: Links }> {
    const params = new URLSearchParams()
    if (query.template_type) params.set('template_type', query.template_type)
    if (query.reference) params.set('reference', query.reference)
    if (query.older_than) params.set('older_than', query.older_than)
    if (query.include_jobs !== undefined) params.set('include_jobs', String(query.include_jobs))
    if (query.status?.length) {
      for (const s of query.status) params.append('status', s)
    }
    const queryStr = params.toString()
    const path = queryStr ? `/v2/notifications?${queryStr}` : '/v2/notifications'

    const raw = await this.request<{
      notifications: Record<string, unknown>[]
      links: { current?: string; next?: string }
    }>('GET', path, authHeader)

    const notifications: Notification[] = (raw.notifications ?? []).map((n) =>
      this.mapNotification(n),
    )
    const links: Links = {
      current: this.rewriteLinksPath(raw.links?.current) ?? '/api/gcnotify/v2/notifications',
      next: raw.links?.next ? this.rewriteLinksPath(raw.links.next) : undefined,
    }

    return { notifications, links }
  }

  async getNotificationById(notificationId: string, authHeader: string): Promise<Notification> {
    const raw = await this.request<Record<string, unknown>>(
      'GET',
      `/v2/notifications/${notificationId}`,
      authHeader,
    )

    return this.mapNotification(raw)
  }

  async sendBulk(body: PostBulkRequest, authHeader: string): Promise<PostBulkResponse> {
    const payload: Record<string, unknown> = {
      name: body.name,
      template_id: body.template_id,
      reference: body.reference,
      scheduled_for: body.scheduled_for,
      reply_to_id: body.reply_to_id,
    }
    // Spec: pass rows OR csv, not both
    if (body.csv) {
      payload.csv = body.csv
    } else if (body.rows) {
      payload.rows = body.rows
    }
    const cleaned = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined))

    const raw = await this.request<{ data: Record<string, unknown> }>(
      'POST',
      '/v2/notifications/bulk',
      authHeader,
      cleaned,
    )

    return {
      data: raw.data as unknown as PostBulkResponse['data'],
    }
  }

  private rewriteLinksPath(link?: string): string | undefined {
    if (!link || typeof link !== 'string') return undefined
    // Rewrite API links to proxy path /gc-notify/v2/notifications?...
    const idx = link.indexOf('?')
    const query = idx >= 0 ? link.slice(idx) : ''
    return `/api/gcnotify/v2/notifications${query}`
  }

  private mapNotification(raw: Record<string, unknown>): Notification {
    const template = raw.template as Record<string, unknown> | undefined
    const templateId =
      template && typeof template.id === 'string' ? template.id : this.toSafeString(raw.template)

    return {
      id: this.toSafeString(raw.id),
      reference: raw.reference != null ? this.toSafeString(raw.reference) : undefined,
      email_address: raw.email_address != null ? this.toSafeString(raw.email_address) : undefined,
      phone_number: raw.phone_number != null ? this.toSafeString(raw.phone_number) : undefined,
      line_1: raw.line_1 != null ? this.toSafeString(raw.line_1) : undefined,
      line_2: raw.line_2 != null ? this.toSafeString(raw.line_2) : undefined,
      line_3: raw.line_3 != null ? this.toSafeString(raw.line_3) : undefined,
      line_4: raw.line_4 != null ? this.toSafeString(raw.line_4) : undefined,
      line_5: raw.line_5 != null ? this.toSafeString(raw.line_5) : undefined,
      line_6: raw.line_6 != null ? this.toSafeString(raw.line_6) : undefined,
      postcode: raw.postcode != null ? this.toSafeString(raw.postcode) : undefined,
      type: (raw.type as 'sms' | 'email') ?? 'email',
      status: this.toSafeString(raw.status) || 'created',
      status_description:
        raw.status_description != null ? this.toSafeString(raw.status_description) : undefined,
      provider_response:
        raw.provider_response != null ? this.toSafeString(raw.provider_response) : undefined,
      template: {
        id: templateId,
        version: template && typeof template.version === 'number' ? template.version : 1,
        uri: `/api/gcnotify/v2/templates/${templateId}`,
      },
      body: this.toSafeString(raw.body),
      subject: raw.subject != null ? this.toSafeString(raw.subject) : undefined,
      created_at: this.toSafeString(raw.created_at) || new Date().toISOString(),
      created_by_name:
        raw.created_by_name != null ? this.toSafeString(raw.created_by_name) : undefined,
      sent_at: raw.sent_at != null ? this.toSafeString(raw.sent_at) : undefined,
      completed_at: raw.completed_at != null ? this.toSafeString(raw.completed_at) : undefined,
      scheduled_for: raw.scheduled_for != null ? this.toSafeString(raw.scheduled_for) : undefined,
      postage: raw.postage != null ? this.toSafeString(raw.postage) : undefined,
    }
  }

  private toSafeString(value: unknown): string {
    if (value == null) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    return ''
  }

  private mapTemplate(raw: Record<string, unknown>): Template {
    return {
      id: this.toSafeString(raw.id),
      name: this.toSafeString(raw.name),
      description: raw.description != null ? this.toSafeString(raw.description) : undefined,
      type: (raw.type as 'sms' | 'email') ?? 'email',
      subject: raw.subject != null ? this.toSafeString(raw.subject) : undefined,
      body: this.toSafeString(raw.body),
      personalisation:
        raw.personalisation != null ? (raw.personalisation as Record<string, string>) : undefined,
      active: raw.active !== false,
      created_at: this.toSafeString(raw.created_at) || new Date().toISOString(),
      updated_at: raw.updated_at != null ? this.toSafeString(raw.updated_at) : undefined,
      created_by: raw.created_by != null ? this.toSafeString(raw.created_by) : undefined,
    }
  }
}
