// import {
//   Injectable,
//   Inject,
//   Logger,
//   NotFoundException,
//   BadRequestException,
//   NotImplementedException,
// } from '@nestjs/common'
// import { ConfigService } from '@nestjs/config'
// import { v4 as uuidv4 } from 'uuid'
// import { BULK_MAX_RECIPIENTS } from './v2/core/constants'
// import {
//   CreateEmailNotificationRequest,
//   CreateSmsNotificationRequest,
//   NotificationResponse,
//   Notification,
//   Template,
//   Links,
//   PostBulkRequest,
//   PostBulkResponse,
//   PostBulkJobData,
// } from './v2/core/schemas'
// import type {
//   ITemplateResolver,
//   ITemplateRendererRegistry,
//   StoredSender,
// } from '../adapters/interfaces'
// import {
//   TEMPLATE_RESOLVER,
//   TEMPLATE_RENDERER_REGISTRY,
//   DEFAULT_TEMPLATE_ENGINE,
// } from '../adapters/tokens'
// import {
//   DeliveryAdapterResolver,
//   GC_NOTIFY_CLIENT,
//   CHES_PASSTHROUGH_CLIENT,
// } from '../common/delivery-context/delivery-adapter.resolver'
// import { DeliveryContextService } from '../common/delivery-context/delivery-context.service'
// import { GcNotifyApiClient } from './gc-notify-api.client'
// import { FileAttachment } from './v2/core/schemas'
// import { TemplatesService } from '../templates/templates.service'
// import { IdentitiesService } from '../identities/identities.service'
// import type { CreateTemplateRequest, UpdateTemplateRequest } from '../templates/v1/core/schemas'
// import type { CreateIdentityRequest, UpdateIdentityRequest } from '../identities/v1/core/schemas'

// function isGcNotifyPassthrough(key: string): boolean {
//   return key === 'gc-notify:passthrough'
// }

// @Injectable()
// export class GcNotifyService {
//   private readonly logger = new Logger(GcNotifyService.name)

//   constructor(
//     private readonly configService: ConfigService,
//     private readonly deliveryAdapterResolver: DeliveryAdapterResolver,
//     private readonly deliveryContextService: DeliveryContextService,
//     private readonly gcNotifyApiClient: GcNotifyApiClient,
//     private readonly templatesService: TemplatesService,
//     private readonly identitiesService: IdentitiesService,
//     @Inject(TEMPLATE_RESOLVER)
//     private readonly templateResolver: ITemplateResolver,
//     @Inject(TEMPLATE_RENDERER_REGISTRY)
//     private readonly rendererRegistry: ITemplateRendererRegistry,
//     @Inject(DEFAULT_TEMPLATE_ENGINE) private readonly defaultEngine: string,
//   ) {}

//   async getNotifications(
//     query: {
//       template_type?: 'sms' | 'email'
//       status?: string[]
//       reference?: string
//       older_than?: string
//       include_jobs?: boolean
//     },
//     authHeader?: string,
//   ): Promise<{ notifications: Notification[]; links: Links }> {
//     const emailKey = this.deliveryContextService.getEmailAdapterKey()
//     const smsKey = this.deliveryContextService.getSmsAdapterKey()

//     if ((isGcNotifyPassthrough(emailKey) || isGcNotifyPassthrough(smsKey)) && authHeader) {
//       return await this.gcNotifyApiClient.getNotifications(query, authHeader)
//     }

//     this.logger.log('Getting notifications list', { query })
//     return {
//       notifications: [],
//       links: { current: '/api/v1/gcnotify/notifications' },
//     }
//   }

//   async getNotificationById(notificationId: string, authHeader?: string): Promise<Notification> {
//     const emailKey = this.deliveryContextService.getEmailAdapterKey()
//     const smsKey = this.deliveryContextService.getSmsAdapterKey()

//     if ((isGcNotifyPassthrough(emailKey) || isGcNotifyPassthrough(smsKey)) && authHeader) {
//       return await this.gcNotifyApiClient.getNotificationById(notificationId, authHeader)
//     }

//     this.logger.log(`Getting notification: ${notificationId}`)
//     throw new NotFoundException('Notification not found in database')
//   }

//   async sendEmail(
//     body: CreateEmailNotificationRequest,
//     authHeader?: string,
//   ): Promise<NotificationResponse> {
//     const emailAdapter = this.deliveryAdapterResolver.getEmailAdapter()

//     if (emailAdapter === CHES_PASSTHROUGH_CLIENT) {
//       throw new NotImplementedException(
//         'CHES passthrough is not yet implemented. Use X-Delivery-Email-Adapter: ches for direct CHES.',
//       )
//     }
//     if (emailAdapter === GC_NOTIFY_CLIENT) {
//       if (!authHeader) {
//         throw new BadRequestException(
//           'X-GC-Notify-Api-Key header is required when using GC Notify passthrough',
//         )
//       }
//       return this.gcNotifyApiClient.sendEmail(body, authHeader)
//     }

//     const notificationId = uuidv4()
//     this.logger.log(`Creating email notification: ${notificationId} to ${body.email_address}`)

//     const template = await this.templateResolver.getById(body.template_id)
//     if (!template) {
//       throw new NotFoundException(`Template ${body.template_id} not found`)
//     }
//     if (!template.active) {
//       throw new BadRequestException(`Template ${body.template_id} is inactive`)
//     }
//     if (template.type !== 'email') {
//       throw new BadRequestException(`Template ${body.template_id} is not an email template`)
//     }

//     const personalisation = this.normalizePersonalisation(body.personalisation)
//     const defaultSubject = this.configService.get<string>(
//       'defaults.templates.defaultSubject',
//       'Notification',
//     )
//     const engine = template.engine ?? this.defaultEngine
//     const renderer = this.rendererRegistry.getRenderer(engine)
//     const rendered = await renderer.renderEmail({
//       template,
//       personalisation,
//       defaultSubject,
//     })

//     const subject = rendered.subject ?? defaultSubject

//     const sender = await this.resolveEmailSender(body.email_reply_to_id)
//     const emailAdapterKey = this.deliveryContextService.getEmailAdapterKey()
//     const fromEmail =
//       sender?.email_address ??
//       this.configService.get<string>(`${emailAdapterKey}.from`) ??
//       this.configService.get<string>('defaults.email.from', 'noreply@localhost')

//     await emailAdapter.send({
//       to: body.email_address,
//       subject,
//       body: rendered.body,
//       from: fromEmail,
//       replyTo: sender?.email_address,
//       attachments: rendered.attachments,
//     })

//     return {
//       id: notificationId,
//       reference: body.reference,
//       content: {
//         from_email: fromEmail,
//         body: rendered.body,
//         subject,
//       },
//       uri: `/api/v1/gcnotify/notifications/${notificationId}`,
//       template: {
//         id: body.template_id,
//         version: 1,
//         uri: `/api/v1/gcnotify/templates/${body.template_id}`,
//       },
//       scheduled_for: body.scheduled_for,
//     }
//   }

//   async sendSms(
//     body: CreateSmsNotificationRequest,
//     authHeader?: string,
//   ): Promise<NotificationResponse> {
//     const smsAdapter = this.deliveryAdapterResolver.getSmsAdapter()

//     if (smsAdapter === GC_NOTIFY_CLIENT) {
//       if (!authHeader) {
//         throw new BadRequestException(
//           'X-GC-Notify-Api-Key header is required when using GC Notify passthrough',
//         )
//       }
//       return this.gcNotifyApiClient.sendSms(body, authHeader)
//     }

//     const notificationId = uuidv4()
//     this.logger.log(`Creating SMS notification: ${notificationId} to ${body.phone_number}`)

//     const template = await this.templateResolver.getById(body.template_id)
//     if (!template) {
//       throw new NotFoundException(`Template ${body.template_id} not found`)
//     }
//     if (!template.active) {
//       throw new BadRequestException(`Template ${body.template_id} is inactive`)
//     }
//     if (template.type !== 'sms') {
//       throw new BadRequestException(`Template ${body.template_id} is not an SMS template`)
//     }

//     const personalisation = body.personalisation ?? {}
//     const engine = template.engine ?? this.defaultEngine
//     const renderer = this.rendererRegistry.getRenderer(engine)
//     const rendered = await renderer.renderSms({
//       template,
//       personalisation,
//     })

//     const sender = await this.resolveSmsSender(body.sms_sender_id)
//     const fromNumber =
//       sender?.sms_sender ??
//       this.configService.get<string>('twilio.fromNumber') ??
//       this.configService.get<string>('defaults.sms.fromNumber', '+15551234567')

//     await smsAdapter.send({
//       to: body.phone_number,
//       body: rendered.body,
//       from: fromNumber,
//     })

//     return {
//       id: notificationId,
//       reference: body.reference,
//       content: {
//         body: rendered.body,
//         from_number: fromNumber,
//       },
//       uri: `/api/v1/gcnotify/notifications/${notificationId}`,
//       template: {
//         id: body.template_id,
//         version: 1,
//         uri: `/api/v1/gcnotify/templates/${body.template_id}`,
//       },
//       scheduled_for: body.scheduled_for,
//     }
//   }

//   private normalizePersonalisation(
//     personalisation?: Record<string, string | FileAttachment>,
//   ): Record<
//     string,
//     string | { file: string; filename: string; sending_method: 'attach' | 'link' }
//   > {
//     if (!personalisation) return {}
//     const result: Record<
//       string,
//       string | { file: string; filename: string; sending_method: 'attach' | 'link' }
//     > = {}
//     for (const [key, value] of Object.entries(personalisation)) {
//       if (typeof value === 'string') {
//         result[key] = value
//       } else {
//         result[key] = {
//           file: value.file,
//           filename: value.filename,
//           sending_method: value.sending_method,
//         }
//       }
//     }
//     return result
//   }

//   private async resolveEmailSender(senderId?: string): Promise<StoredSender | null> {
//     if (senderId) {
//       return this.identitiesService.findById(senderId)
//     }
//     return this.identitiesService.getDefaultIdentity('email')
//   }

//   private async resolveSmsSender(senderId?: string): Promise<StoredSender | null> {
//     if (senderId) {
//       return this.identitiesService.findById(senderId)
//     }
//     return this.identitiesService.getDefaultIdentity('sms')
//   }

//   async sendBulk(body: PostBulkRequest, authHeader?: string): Promise<PostBulkResponse> {
//     const emailKey = this.deliveryContextService.getEmailAdapterKey()
//     const smsKey = this.deliveryContextService.getSmsAdapterKey()

//     if ((isGcNotifyPassthrough(emailKey) || isGcNotifyPassthrough(smsKey)) && authHeader) {
//       return await this.gcNotifyApiClient.sendBulk(body, authHeader)
//     }

//     if (!body.rows && !body.csv) {
//       throw new BadRequestException('You should specify either rows or csv')
//     }

//     const rowCount = body.rows ? body.rows.length - 1 : (body.csv?.split('\n').length ?? 1) - 1

//     if (rowCount < 1) {
//       throw new BadRequestException(
//         'rows must have at least a header row and one data row (1-50,000 recipients)',
//       )
//     }

//     if (rowCount > BULK_MAX_RECIPIENTS) {
//       throw new BadRequestException(
//         `Too many rows. Maximum number of rows allowed is ${BULK_MAX_RECIPIENTS}`,
//       )
//     }

//     const jobId = uuidv4()
//     this.logger.log(`Creating bulk job: ${jobId} with ${rowCount} recipients`)

//     const now = new Date().toISOString()
//     const data: PostBulkJobData = {
//       id: jobId,
//       template: body.template_id,
//       job_status: 'pending',
//       notification_count: rowCount,
//       created_at: now,
//     }

//     return { data }
//   }

//   async getTemplates(
//     type?: 'sms' | 'email',
//     authHeader?: string,
//   ): Promise<{ templates: Template[] }> {
//     const emailKey = this.deliveryContextService.getEmailAdapterKey()
//     const smsKey = this.deliveryContextService.getSmsAdapterKey()

//     if ((isGcNotifyPassthrough(emailKey) || isGcNotifyPassthrough(smsKey)) && authHeader) {
//       return this.gcNotifyApiClient.getTemplates(type, authHeader)
//     }

//     return this.templatesService.getTemplates(type)
//   }

//   async getTemplate(templateId: string, authHeader?: string): Promise<Template> {
//     const emailKey = this.deliveryContextService.getEmailAdapterKey()
//     const smsKey = this.deliveryContextService.getSmsAdapterKey()

//     if ((isGcNotifyPassthrough(emailKey) || isGcNotifyPassthrough(smsKey)) && authHeader) {
//       return this.gcNotifyApiClient.getTemplate(templateId, authHeader)
//     }

//     return this.templatesService.getTemplate(templateId)
//   }

//   // --- Identities CRUD (delegates to IdentitiesService) ---

//   getIdentities(type?: 'email' | 'sms' | 'email+sms') {
//     return this.identitiesService.getIdentities(type)
//   }

//   getIdentity(identityId: string) {
//     return this.identitiesService.getIdentity(identityId)
//   }

//   createIdentity(body: CreateIdentityRequest) {
//     return this.identitiesService.createIdentity(body)
//   }

//   updateIdentity(identityId: string, body: UpdateIdentityRequest) {
//     return this.identitiesService.updateIdentity(identityId, body)
//   }

//   deleteIdentity(identityId: string) {
//     return this.identitiesService.deleteIdentity(identityId)
//   }

//   // --- Templates CRUD (delegates to TemplatesService) ---

//   createTemplate(body: CreateTemplateRequest) {
//     return this.templatesService.createTemplate(body)
//   }

//   updateTemplate(templateId: string, body: UpdateTemplateRequest) {
//     return this.templatesService.updateTemplate(templateId, body)
//   }

//   deleteTemplate(templateId: string) {
//     return this.templatesService.deleteTemplate(templateId)
//   }
// }
