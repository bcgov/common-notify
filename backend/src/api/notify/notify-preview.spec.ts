import { Test } from '@nestjs/testing'
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common'
import { getRepositoryToken } from '@nestjs/typeorm'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import request from 'supertest'
import { NotifySimpleController } from './notify.controller'
import { NotifyPreviewService } from './services/notify-preview.service'
import { TemplatesService } from '../templates/templates.service'
import { TemplatesRepository } from '../templates/templates.repository'
import { EmailTemplateLayoutService } from '../templates/email-template-layout.service'
import { RenderingModule } from '../../services/rendering/rendering.module'
import { ValidationExceptionFilter } from '../../common/filters/validation.filter'
import { FeatureFlagService } from '../feature-flag/feature-flag.service'
import { Tenant } from '../admin/tenants/entities/tenant.entity'
import { ApiKeyConsumer } from '../api-keys/entities/api-key-consumer.entity'
import { NotificationService } from '../notification/notification.service'
import { NotificationRequestDetailService } from '../notification/notification-request-detail.service'
import { ApiKeyUsageService } from '../api-keys/api-key-usage.service'
import { SafelistService } from '../safelist/safelist.service'
import { QueueName } from '../../enum/queue-name.enum'
import { TemplateEngine } from '../../enum/template-engine.enum'
import { NotificationChannel } from '../../enum/notification-channel.enum'

describe('Notify preview HTTP pipeline', () => {
  let app: INestApplication
  let templates: TemplatesService
  const templateId = '3f1a7c2e-9b45-4d10-8e21-6c0f5a9b7d33'
  const template = {
    id: templateId,
    tenantId: 'tenant-1',
    name: 'Greeting',
    active: true,
    channelCode: NotificationChannel.EMAIL,
    engineCode: TemplateEngine.HANDLEBARS,
    subject: 'Hello {{name}}',
    body: 'Welcome {{name}}',
    bodyType: 'markdown',
  }
  const repository = { findById: vi.fn() }
  const binding = { findOne: vi.fn() }
  const flags = { getFlagsForTenant: vi.fn(), isEnabled: vi.fn() }
  const layout = { apply: vi.fn((_template, rendered) => Promise.resolve(rendered)) }
  const notification = { create: vi.fn(), update: vi.fn(), validateBusinessRules: vi.fn() }
  const details = { createPending: vi.fn(), createBlocked: vi.fn() }
  const queue = { add: vi.fn() }
  const usage = { recordUsage: vi.fn(), assertWithinLimits: vi.fn() }
  const safelist = { isEnforced: vi.fn(), findBlocked: vi.fn() }
  const sideEffects = [notification, details, queue, usage, safelist]
  const email = () => ({
    recipients: { to: ['Alice@example.com'], cc: ['copy@example.com'] },
    content: {
      subject: 'Hello {{name}}',
      body: 'Welcome {{name}}',
      renderer: 'handlebars',
      bodyType: 'text',
      encoding: 'utf-8',
    },
    params: { name: 'Alice' },
  })
  const sms = () => ({
    recipients: { to: ['2505550123'] },
    content: { body: 'Hi {{name}}', renderer: 'handlebars' },
  })
  const post = (path: string, body: object) =>
    request(app.getHttpServer())
      .post(`/api/v1/notifysimple${path}`)
      .set('x-credential-identifier', 'test-credential')
      .send(body)

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [RenderingModule],
      controllers: [NotifySimpleController],
      providers: [
        NotifyPreviewService,
        TemplatesService,
        { provide: TemplatesRepository, useValue: repository },
        { provide: EmailTemplateLayoutService, useValue: layout },
        { provide: getRepositoryToken(Tenant), useValue: {} },
        { provide: getRepositoryToken(ApiKeyConsumer), useValue: binding },
        { provide: FeatureFlagService, useValue: flags },
        { provide: NotificationService, useValue: notification },
        { provide: NotificationRequestDetailService, useValue: details },
        { provide: QueueName.INGESTION, useValue: queue },
        { provide: ApiKeyUsageService, useValue: usage },
        { provide: SafelistService, useValue: safelist },
      ],
    })
      .useMocker(() => ({}))
      .compile()
    templates = module.get(TemplatesService)
    app = module.createNestApplication()
    app.useLogger(false)
    app.setGlobalPrefix('api')
    app.enableVersioning({ type: VersioningType.URI })
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    )
    app.useGlobalFilters(new ValidationExceptionFilter())
    await app.init()
  })
  beforeEach(() => {
    vi.clearAllMocks()
    binding.findOne.mockResolvedValue({
      id: 'key-1',
      tenantId: 'tenant-1',
      tenant: { id: 'tenant-1', name: 'Test', isDeleted: false },
    })
    flags.getFlagsForTenant.mockResolvedValue({ sms_notifications: true })
    flags.isEnabled.mockResolvedValue(true)
    repository.findById.mockResolvedValue(template)
  })
  afterEach(() => {
    // Assert the persistence and queue boundaries directly, not just a successful response.
    // These are test doubles, not proof of a live PostgreSQL/Redis state comparison.
    for (const dependency of sideEffects) {
      for (const method of Object.values(dependency)) expect(method).not.toHaveBeenCalled()
    }
  })
  afterAll(async () => {
    await app?.close()
  })

  it.each(['', '/email'])(
    'renders inline email on %s without entering the send pipeline',
    async (path) => {
      const channel = email()
      const response = await post(
        `${path}?preview=true`,
        path ? channel : { email: channel },
      ).expect(200)
      expect(response.body).toEqual({
        email: {
          recipients: channel.recipients,
          content: {
            subject: 'Hello Alice',
            body: 'Welcome Alice',
            bodyType: 'text',
            encoding: 'utf-8',
          },
        },
      })
      expect(repository.findById).not.toHaveBeenCalled()
      expect(binding.findOne).toHaveBeenCalled()
    },
  )

  it('renders email, SMS and message app with channel params overriding shared params', async () => {
    const channel = sms()
    const response = await post('?preview=true', {
      email: email(),
      sms: channel,
      msgApp: {
        recipients: { to: ['app-user'] },
        content: { body: 'App {{name}}', renderer: 'mustache' },
      },
      params: { name: 'Shared' },
    }).expect(200)
    expect(response.body.email.content.body).toBe('Welcome Alice')
    expect(response.body.sms).toEqual({
      recipients: channel.recipients,
      content: { body: 'Hi Shared' },
    })
    expect(response.body.msgApp.content.body).toBe('App Shared')
    expect(flags.getFlagsForTenant).toHaveBeenCalledWith('tenant-1')
  })

  it('passes literal inline content through without a renderer', async () => {
    const channel = {
      recipients: email().recipients,
      content: { subject: 'Literal', body: 'Plain body', bodyType: 'text' },
    }
    const response = await post('/email?preview=true', channel).expect(200)
    expect(response.body.email).toEqual(channel)
  })

  it.each(['', '/email'])(
    'renders a stored template through TemplatesService on %s',
    async (path) => {
      const spy = vi.spyOn(templates, 'renderTemplateContent')
      const channel = {
        recipients: email().recipients,
        content: { templateId },
        params: { name: 'Alice' },
      }
      const response = await post(
        `${path}?preview=true`,
        path ? channel : { email: channel },
      ).expect(200)
      expect(response.body.email.content).toEqual({
        subject: 'Hello Alice',
        body: 'Welcome Alice',
        bodyType: 'markdown',
      })
      expect(repository.findById).toHaveBeenCalledWith('tenant-1', templateId)
      expect(spy).toHaveBeenCalledWith(template, { name: 'Alice' })
      expect(layout.apply).toHaveBeenCalled()
    },
  )

  it('retains template personalisation validation', async () => {
    const response = await post('/email?preview=true', {
      recipients: email().recipients,
      content: { templateId },
    }).expect(400)
    expect(response.body.message).toContain('Missing personalisation')
    expect(layout.apply).not.toHaveBeenCalled()
  })

  it('renders SMS templates using their existing plain-text path', async () => {
    repository.findById.mockResolvedValue({ ...template, channelCode: NotificationChannel.SMS })
    const response = await post('?preview=true', {
      sms: { recipients: sms().recipients, content: { templateId } },
      params: { name: 'Sam' },
    }).expect(200)
    expect(response.body.sms.content).toEqual({ body: 'Welcome Sam' })
    expect(layout.apply).not.toHaveBeenCalled()
  })

  it('rejects inaccessible templates', async () => {
    repository.findById.mockResolvedValue(null)
    await post('/email?preview=true', {
      recipients: email().recipients,
      content: { templateId },
    }).expect(404)
  })

  it.each(['email', 'sms', 'msgApp'])('rejects %s attachments', async (name) => {
    const channel = name === 'sms' ? sms() : email()
    await post('?preview=true', {
      [name]: {
        ...channel,
        recipients: { to: name === 'sms' ? ['2505550123'] : ['a@example.com'] },
        attachments: [{ filename: 'a.txt', mimeType: 'text/plain', content: 'aGVsbG8=' }],
      },
    }).expect(400)
    expect(repository.findById).not.toHaveBeenCalled()
  })

  it.each(['email', 'sms'])('rejects %s mail merge', async (name) => {
    const channel = name === 'sms' ? sms() : email()
    const response = await post('?preview=true', {
      [name]: {
        ...channel,
        recipients: { mergeArray: [['to'], [name === 'sms' ? '2505550123' : 'a@example.com']] },
      },
    }).expect(400)
    expect(JSON.stringify(response.body)).toContain('mail-merge preview is not yet supported')
  })

  it.each(['', '/email'])('matches normal DTO error formatting on %s', async (path) => {
    const channel = { ...email(), content: { body: 42 }, unexpected: true }
    const body = path ? channel : { email: channel }
    const normal = await post(path, body).expect(400)
    const preview = await post(`${path}?preview=true`, body).expect(400)
    expect(preview.body).toEqual(normal.body)
    expect(preview.body).toMatchObject({
      statusCode: 400,
      message: 'Validation failed',
      errors: expect.any(Array),
      fieldErrors: expect.any(Object),
    })
  })

  it('rejects absent content with the standard validation envelope', async () => {
    const response = await post('/email?preview=true', { recipients: email().recipients }).expect(
      400,
    )
    expect(response.body).toMatchObject({
      statusCode: 400,
      message: 'Validation failed',
      fieldErrors: { 'email.content': expect.any(String) },
    })
  })

  it('retains recipient mutual exclusion', async () => {
    const channel = {
      ...email(),
      recipients: { to: ['a@example.com'], mergeArray: [['to'], ['b@example.com']] },
    }
    const normal = await post('/email', channel).expect(400)
    const preview = await post('/email?preview=true', channel).expect(400)
    expect(preview.body).toEqual(normal.body)
  })

  it('retains template/inline mutual exclusion', async () => {
    const channel = { ...email(), content: { ...email().content, templateId } }
    const normal = await post('/email', channel).expect(400)
    const preview = await post('/email?preview=true', channel).expect(400)
    expect(preview.body).toEqual(normal.body)
  })

  it('keeps the real authentication guard active', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/notifysimple?preview=true')
      .send({ email: email() })
      .expect(401)
    expect(repository.findById).not.toHaveBeenCalled()
  })

  it('keeps SMS feature guard behavior identical to real sends', async () => {
    flags.getFlagsForTenant.mockResolvedValue({ sms_notifications: false })
    const body = { email: email(), sms: sms() }
    const normal = await post('', body).expect(403)
    const preview = await post('?preview=true', body).expect(403)
    expect(preview.body).toEqual(normal.body)
  })

  it.each(['', '/email'])('keeps HTML feature guard active on %s', async (path) => {
    flags.isEnabled.mockResolvedValue(false)
    const channel = { ...email(), content: { ...email().content, bodyType: 'html' } }
    const body = path ? channel : { email: channel }
    const normal = await post(path, body).expect(403)
    const preview = await post(`${path}?preview=true`, body).expect(403)
    expect(preview.body).toEqual(normal.body)
  })

  it('documents preview on both routes', () => {
    const doc = SwaggerModule.createDocument(app, new DocumentBuilder().build())
    const patchBody = doc.paths['/api/v1/notifysimple/{notificationId}'].patch.requestBody
    expect(patchBody).toMatchObject({
      content: {
        'application/json': {
          schema: {
            oneOf: [
              { $ref: '#/components/schemas/CancelNotificationDto' },
              { $ref: '#/components/schemas/RescheduleNotificationDto' },
            ],
          },
        },
      },
    })
    expect(doc.components.schemas.CancelNotificationDto).toBeDefined()
    expect(doc.components.schemas.RescheduleNotificationDto).toBeDefined()
    for (const path of ['/api/v1/notifysimple', '/api/v1/notifysimple/email']) {
      expect(doc.paths[path].post.parameters).toContainEqual(
        expect.objectContaining({
          name: 'preview',
          in: 'query',
          required: false,
          schema: { type: 'boolean' },
        }),
      )
      expect(doc.paths[path].post.responses['200']).toBeDefined()
    }
  })
})
