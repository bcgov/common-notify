import type { Template } from '../../api/templates/entities/template.entity'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { TemplateEngine } from '../../enum/template-engine.enum'
import { extractTemplatePersonalisationKeys } from './template-personalisation-validation'

describe('extractTemplatePersonalisationKeys', () => {
  const makeTemplate = (overrides: Partial<Template>): Template => ({
    id: 'template-123',
    tenantId: 'tenant-123',
    name: 'Test Template',
    description: 'Test template',
    channelCode: NotificationChannel.EMAIL,
    subject: 'Subject',
    body: 'Body',
    engineCode: TemplateEngine.HANDLEBARS,
    bodyType: 'markdown',
    version: 1,
    active: true,
    createdBy: 'user-123',
    createdAt: new Date(),
    updatedBy: 'user-123',
    updatedAt: new Date(),
    ...overrides,
  })

  it('extracts Legacy GC Notify ((firstName))', () => {
    const template = makeTemplate({
      engineCode: TemplateEngine.LEGACY_GC_NOTIFY,
      body: 'Hello ((firstName))',
    })

    expect(extractTemplatePersonalisationKeys(template)).toEqual(['firstName'])
  })

  it('extracts Legacy GC Notify fallback syntax as the key before ??', () => {
    const template = makeTemplate({
      engineCode: TemplateEngine.LEGACY_GC_NOTIFY,
      body: 'Status: ((status??submitted for review))',
    })

    expect(extractTemplatePersonalisationKeys(template)).toEqual(['status'])
  })

  it('extracts Handlebars dynamic placeholders', () => {
    const template = makeTemplate({
      engineCode: TemplateEngine.HANDLEBARS,
      body: 'Case {{caseNumber}}',
    })

    expect(extractTemplatePersonalisationKeys(template)).toEqual(['caseNumber'])
  })

  it('treats Handlebars #if arguments as required personalisation', () => {
    const template = makeTemplate({
      engineCode: TemplateEngine.HANDLEBARS,
      body: '{{#if isApproved}}Approved{{/if}}',
    })

    expect(extractTemplatePersonalisationKeys(template)).toEqual(['isApproved'])
  })

  it('ignores Handlebars else and closing tags', () => {
    const template = makeTemplate({
      engineCode: TemplateEngine.HANDLEBARS,
      body: '{{#if isApproved}}Yes{{else}}No{{/if}}',
    })

    expect(extractTemplatePersonalisationKeys(template)).toEqual(['isApproved'])
  })

  it('treats Handlebars #each arguments as required personalisation', () => {
    const template = makeTemplate({
      engineCode: TemplateEngine.HANDLEBARS,
      body: '{{#each items}}{{this}}{{/each}}',
    })

    expect(extractTemplatePersonalisationKeys(template)).toEqual(['items'])
  })

  it('treats Handlebars #unless arguments as required personalisation', () => {
    const template = makeTemplate({
      engineCode: TemplateEngine.HANDLEBARS,
      body: '{{#unless isBlocked}}Allowed{{/unless}}',
    })

    expect(extractTemplatePersonalisationKeys(template)).toEqual(['isBlocked'])
  })

  it('treats Handlebars #with arguments as required personalisation', () => {
    const template = makeTemplate({
      engineCode: TemplateEngine.HANDLEBARS,
      body: '{{#with user}}{{firstName}}{{/with}}',
    })

    expect(extractTemplatePersonalisationKeys(template)).toEqual(['user'])
  })

  it('does not require Handlebars partial names as personalisation', () => {
    const template = makeTemplate({
      engineCode: TemplateEngine.HANDLEBARS,
      body: 'Hello {{firstName}} {{> partialName}}',
    })

    expect(extractTemplatePersonalisationKeys(template)).toEqual(['firstName'])
  })

  it('extracts Mustache dynamic placeholders', () => {
    const template = makeTemplate({
      engineCode: TemplateEngine.MUSTACHE,
      body: 'Hello {{firstName}}, case {{caseNumber}}',
    })

    expect(extractTemplatePersonalisationKeys(template)).toEqual(['firstName', 'caseNumber'])
  })

  it('treats Mustache section and inverted section names as required personalisation', () => {
    const template = makeTemplate({
      engineCode: TemplateEngine.MUSTACHE,
      body: '{{#items}}Item{{/items}}{{^isEmpty}}Filled{{/isEmpty}}',
    })

    expect(extractTemplatePersonalisationKeys(template)).toEqual(['items', 'isEmpty'])
  })

  it('ignores Mustache closing tags', () => {
    const template = makeTemplate({
      engineCode: TemplateEngine.MUSTACHE,
      body: '{{#items}}Item{{/items}}',
    })

    expect(extractTemplatePersonalisationKeys(template)).toEqual(['items'])
  })

  it('de-duplicates repeated placeholders', () => {
    const template = makeTemplate({
      engineCode: TemplateEngine.HANDLEBARS,
      body: 'Hello {{firstName}} again {{firstName}}',
      subject: 'Welcome {{firstName}}',
    })

    expect(extractTemplatePersonalisationKeys(template)).toEqual(['firstName'])
  })

  it('returns keys in stable template order across body then subject', () => {
    const template = makeTemplate({
      engineCode: TemplateEngine.LEGACY_GC_NOTIFY,
      body: 'Hello ((firstName)), amount ((amount))',
      subject: 'Order ((orderNumber)) status ((status??submitted))',
    })

    expect(extractTemplatePersonalisationKeys(template)).toEqual([
      'firstName',
      'amount',
      'orderNumber',
      'status',
    ])
  })
})
