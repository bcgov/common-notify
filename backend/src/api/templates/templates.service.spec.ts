import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { BadRequestException } from '@nestjs/common'
import { TemplatesService } from './templates.service'
import { TemplatesRepository } from './templates.repository'
import { Template } from './entities/template.entity'
import { TemplateEngine } from '../../enum/template-engine.enum'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { RenderingModule } from '../../services/rendering/rendering.module'
import { TenantsService } from '../admin/tenants/tenants.service'

describe('TemplatesService', () => {
  let service: TemplatesService

  const mockTemplate: Template = {
    id: 'template-123',
    tenantId: 'tenant-123',
    tenant: undefined as any,
    name: 'Welcome Email',
    description: 'Welcome template',
    channelCode: NotificationChannel.EMAIL,
    channel: undefined as any,
    subject: 'Welcome to {{siteName}}!',
    body: 'Hello {{userName}}, welcome!',
    engineCode: TemplateEngine.HANDLEBARS,
    engine: undefined as any,
    bodyType: 'markdown',
    version: 1,
    active: true,
    createdBy: 'user-123',
    createdAt: new Date(),
    updatedBy: 'user-123',
    updatedAt: new Date(),
  }

  const mockMarkdownTemplate: Template = {
    ...mockTemplate,
    bodyType: 'markdown',
    body: '# Welcome {{userName}}\n\nThis is **bold** text with [link](https://example.com)',
  }

  const mockMjmlTemplate: Template = {
    ...mockTemplate,
    subject: 'Welcome {{userName}}',
    body: `
      <mjml>
        <mj-body>
          <mj-section>
            <mj-column>
              <mj-text>Hello {{userName}}</mj-text>
            </mj-column>
          </mj-section>
        </mj-body>
      </mjml>
    `,
    engineCode: TemplateEngine.MJML,
    bodyType: null,
  }

  const mockMjmlSmsTemplate: Template = {
    ...mockTemplate,
    channelCode: NotificationChannel.SMS,
    subject: undefined,
    body: 'Your code is {{code}}',
    engineCode: TemplateEngine.MJML,
    bodyType: null,
  }

  const mockLegacyTemplate: Template = {
    ...mockTemplate,
    subject: 'Order ((orderNumber)) update',
    body: 'Hello ((firstName)), status: ((status))',
    engineCode: TemplateEngine.LEGACY_GC_NOTIFY,
  }

  const mockMustacheTemplate: Template = {
    ...mockTemplate,
    subject: 'Case {{caseNumber}}',
    body: 'Hello {{firstName}}',
    engineCode: TemplateEngine.MUSTACHE,
  }

  const mockRepository = {
    create: vi.fn(),
    update: vi.fn(),
    findById: vi.fn(),
    findByName: vi.fn(),
    findByTenantId: vi.fn(),
    softDelete: vi.fn(),
    createVersion: vi.fn(),
  }

  const mockTenantsService = {
    findOne: vi.fn(),
    findByExternalId: vi.fn(),
    findAll: vi.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [RenderingModule],
      providers: [
        TemplatesService,
        {
          provide: TemplatesRepository,
          useValue: mockRepository,
        },
        {
          provide: TenantsService,
          useValue: mockTenantsService,
        },
      ],
    }).compile()

    service = module.get<TemplatesService>(TemplatesService)

    vi.clearAllMocks()
  })

  describe('renderTemplateContent', () => {
    it('should render template and return with markdown bodyType', async () => {
      const result = await service.renderTemplateContent(mockTemplate, {
        userName: 'John',
        siteName: 'MyApp',
      })

      expect(result.subject).toBe('Welcome to MyApp!')
      expect(result.body).toBe('Hello John, welcome!')
      expect(result.bodyType).toBe('markdown')
    })

    it('should fall back to html when stored MJML bodyType is null', async () => {
      const result = await service.renderTemplateContent(mockMjmlTemplate, {
        userName: 'John',
      })

      expect(result.subject).toBe('Welcome John')
      expect(result.body).toContain('<!doctype html>')
      expect(result.bodyType).toBe('html')
    })

    it('should render markdown template and return bodyType without converting', async () => {
      const result = await service.renderTemplateContent(mockMarkdownTemplate, {
        userName: 'John',
        siteName: 'MyApp',
      })

      // Body should be raw markdown, not converted to HTML (adapter handles that)
      expect(result.body).toBe(
        '# Welcome John\n\nThis is **bold** text with [link](https://example.com)',
      )
      expect(result.bodyType).toBe('markdown')
      // Should NOT contain HTML tags from markdown conversion
      expect(result.body).not.toContain('<h1>')
      expect(result.body).not.toContain('<strong>')
    })

    it('should render subject without markdown syntax expansion', async () => {
      const result = await service.renderTemplateContent(mockMarkdownTemplate, {
        userName: 'John',
        siteName: 'MyApp',
      })

      // Subject should be plain text, not wrapped in <p> tags or HTML
      expect(result.subject).not.toContain('<p>')
      expect(result.subject).not.toContain('</p>')
      expect(result.subject).not.toContain('<h1>')
    })

    it('should throw when markdown template values are missing', async () => {
      const template: Template = {
        ...mockMarkdownTemplate,
        body: '# Title\n\nHello {{unknownVar}}, welcome!',
      }

      await expect(
        service.renderTemplateContent(template, {
          siteName: 'MyApp',
        }),
      ).rejects.toThrow('Missing personalisation for template ID template-123: unknownVar')
    })

    it('should handle markdown with special characters', async () => {
      const template: Template = {
        ...mockMarkdownTemplate,
        body: '# Title\n\n**Bold** and _italic_ & special chars',
      }

      const result = await service.renderTemplateContent(template, { siteName: 'MyApp' })

      expect(result.body).toContain('**Bold**')
      expect(result.body).toContain('_italic_')
      expect(result.body).toContain('special chars')
      expect(result.bodyType).toBe('markdown')
    })

    it('should handle markdown with code blocks', async () => {
      const template: Template = {
        ...mockMarkdownTemplate,
        body: '# Code Example\n\n```javascript\nconst x = 5;\n```',
      }

      const result = await service.renderTemplateContent(template, { siteName: 'MyApp' })

      expect(result.body).toContain('```javascript')
      expect(result.body).toContain('const x = 5;')
      expect(result.bodyType).toBe('markdown')
    })

    it('should handle markdown with lists', async () => {
      const template: Template = {
        ...mockMarkdownTemplate,
        body: '# Items\n\n- Item 1\n- Item 2\n- Item 3',
      }

      const result = await service.renderTemplateContent(template, { siteName: 'MyApp' })

      expect(result.body).toContain('- Item 1')
      expect(result.body).toContain('- Item 2')
      expect(result.bodyType).toBe('markdown')
    })

    it('should handle markdown with tables', async () => {
      const template: Template = {
        ...mockMarkdownTemplate,
        body: '| Name | Value |\n|------|-------|\n| A | 1 |\n| B | 2 |',
      }

      const result = await service.renderTemplateContent(template, { siteName: 'MyApp' })

      expect(result.body).toContain('| Name | Value |')
      expect(result.body).toContain('| A | 1 |')
      expect(result.bodyType).toBe('markdown')
    })

    it('should preserve undefined personalisation for templates without placeholders', async () => {
      const result = await service.renderTemplateContent({
        ...mockTemplate,
        subject: 'Static subject',
        body: 'Static body',
      })

      expect(result).toHaveProperty('subject')
      expect(result).toHaveProperty('body')
    })

    it('should render stored MJML email templates to HTML', async () => {
      const result = await service.renderTemplateContent(mockMjmlTemplate, {
        userName: 'John',
      })

      expect(result.subject).toBe('Welcome John')
      expect(result.body).toContain('<!doctype html>')
      expect(result.body).toContain('Hello John')
      expect(result.bodyType).toBe('html')
    })

    it('should render stored MJML SMS templates as plain text through renderEmail path', async () => {
      const result = await service.renderTemplateContent(mockMjmlSmsTemplate, {
        code: '123456',
      })

      expect(result.body).toBe('Your code is 123456')
      expect(result.bodyType).toBe('html')
    })

    it('should throw BadRequestException for missing Legacy GC Notify personalisation', async () => {
      await expect(service.renderTemplateContent(mockLegacyTemplate, {})).rejects.toThrow(
        BadRequestException,
      )
      await expect(service.renderTemplateContent(mockLegacyTemplate, {})).rejects.toThrow(
        'Missing personalisation for template ID template-123: firstName, status, orderNumber',
      )
    })

    it('should require the Legacy GC Notify key before ?? fallback text', async () => {
      const template: Template = {
        ...mockLegacyTemplate,
        body: 'Status: ((status??submitted for review))',
        subject: 'Static subject',
      }

      await expect(service.renderTemplateContent(template, {})).rejects.toThrow(
        'Missing personalisation for template ID template-123: status',
      )
    })

    it('should preserve Legacy GC Notify empty substitution for present null values', async () => {
      const template: Template = {
        ...mockLegacyTemplate,
        subject: 'Static subject',
        body: 'Status: ((status))',
      }

      const result = await service.renderTemplateContent(template, { status: null })

      expect(result.body).toBe('Status: ')
    })

    it('should throw a clean error when personalisation is null and placeholders are required', async () => {
      const template: Template = {
        ...mockTemplate,
        subject: 'Static subject',
        body: 'Hello {{firstName}}',
      }

      await expect(service.renderTemplateContent(template, null as any)).rejects.toThrow(
        BadRequestException,
      )
      await expect(service.renderTemplateContent(template, null as any)).rejects.toThrow(
        'Missing personalisation for template ID template-123: firstName',
      )
    })

    it('should throw a clean error when personalisation is undefined and placeholders are required', async () => {
      const template: Template = {
        ...mockTemplate,
        subject: 'Static subject',
        body: 'Hello {{firstName}}',
      }

      await expect(service.renderTemplateContent(template, undefined)).rejects.toThrow(
        BadRequestException,
      )
      await expect(service.renderTemplateContent(template, undefined)).rejects.toThrow(
        'Missing personalisation for template ID template-123: firstName',
      )
    })

    it('should throw BadRequestException for missing Handlebars personalisation', async () => {
      const template: Template = {
        ...mockTemplate,
        subject: 'Welcome {{siteName}}',
        body: '{{#if isApproved}}Approved{{/if}} for {{caseNumber}}',
      }

      await expect(service.renderTemplateContent(template, {})).rejects.toThrow(
        'Missing personalisation for template ID template-123: isApproved, caseNumber, siteName',
      )
    })

    it('should accept empty-string values as present personalisation', async () => {
      const template: Template = {
        ...mockTemplate,
        subject: 'Static subject',
        body: 'Status: {{status}}',
      }

      const result = await service.renderTemplateContent(template, { status: '' })

      expect(result.body).toBe('Status: ')
      expect(result.bodyType).toBe('markdown')
    })

    it('should ignore extra unused personalisation keys', async () => {
      const template: Template = {
        ...mockTemplate,
        subject: 'Static subject',
        body: 'Hello {{firstName}}',
      }

      const result = await service.renderTemplateContent(template, {
        firstName: 'Test',
        unusedKey: 'extra',
      })

      expect(result.body).toBe('Hello Test')
    })

    it('should validate Handlebars unless arguments', async () => {
      const template: Template = {
        ...mockTemplate,
        subject: 'Static subject',
        body: '{{#unless isBlocked}}Allowed{{/unless}}',
      }

      await expect(service.renderTemplateContent(template, {})).rejects.toThrow(
        'Missing personalisation for template ID template-123: isBlocked',
      )
    })

    it('should not require Handlebars variables inside a false #if branch', async () => {
      const template: Template = {
        ...mockTemplate,
        subject: 'Static subject',
        body: '{{#if isSubscribed}}Hello {{name}}{{/if}}',
      }

      const result = await service.renderTemplateContent(template, { isSubscribed: false })

      expect(result.body).toBe('')
    })

    it('should require Handlebars variables inside a true #if branch', async () => {
      const template: Template = {
        ...mockTemplate,
        subject: 'Static subject',
        body: '{{#if isSubscribed}}Hello {{name}}{{/if}}',
      }

      await expect(service.renderTemplateContent(template, { isSubscribed: true })).rejects.toThrow(
        'Missing personalisation for template ID template-123: name',
      )
    })

    it('should validate only the selected Handlebars #if/else branch', async () => {
      const template: Template = {
        ...mockTemplate,
        subject: 'Static subject',
        body: '{{#if isSubscribed}}Hello {{name}}{{else}}Reason: {{reason}}{{/if}}',
      }

      await expect(
        service.renderTemplateContent(template, { isSubscribed: true, reason: 'paused' }),
      ).rejects.toThrow('Missing personalisation for template ID template-123: name')
      await expect(
        service.renderTemplateContent(template, { isSubscribed: false, name: 'Alice' }),
      ).rejects.toThrow('Missing personalisation for template ID template-123: reason')
    })

    it('should apply inverse branch validation for Handlebars #unless', async () => {
      const template: Template = {
        ...mockTemplate,
        subject: 'Static subject',
        body: '{{#unless isSubscribed}}Hello {{name}}{{else}}Subscribed{{/unless}}',
      }

      await expect(
        service.renderTemplateContent(template, { isSubscribed: false }),
      ).rejects.toThrow('Missing personalisation for template ID template-123: name')

      const result = await service.renderTemplateContent(template, { isSubscribed: true })
      expect(result.body).toBe('Subscribed')
    })

    it('should still report a missing Handlebars condition key', async () => {
      const template: Template = {
        ...mockTemplate,
        subject: 'Static subject',
        body: '{{#if isSubscribed}}Hello{{/if}}',
      }

      await expect(service.renderTemplateContent(template, {})).rejects.toThrow(
        'Missing personalisation for template ID template-123: isSubscribed',
      )
    })

    it('should preserve Handlebars #each scoping and typed arrays', async () => {
      const template: Template = {
        ...mockTemplate,
        subject: 'Static subject',
        body: '{{#each articles}}{{title}} by {{author}};{{/each}}',
      }

      const emptyResult = await service.renderTemplateContent(template, { articles: [] })
      expect(emptyResult.body).toBe('')

      const populatedResult = await service.renderTemplateContent(template, {
        articles: [{ title: 'One', author: 'Ada' }],
      })
      expect(populatedResult.body).toBe('One by Ada;')
    })

    it('should preserve typed false values for Mustache sections', async () => {
      const template: Template = {
        ...mockMustacheTemplate,
        subject: 'Static subject',
        body: '{{#isSubscribed}}Hello {{name}}{{/isSubscribed}}',
      }

      const result = await service.renderTemplateContent(template, { isSubscribed: false })

      expect(result.body).toBe('')
    })

    it('should apply value-aware Handlebars validation to email subject and body', async () => {
      const template: Template = {
        ...mockTemplate,
        subject: '{{#if includeSubject}}Hello {{subjectName}}{{/if}}',
        body: '{{#if includeBody}}Body for {{bodyName}}{{/if}}',
      }

      await expect(
        service.renderTemplateContent(template, {
          includeSubject: false,
          includeBody: true,
        }),
      ).rejects.toThrow('Missing personalisation for template ID template-123: bodyName')

      await expect(
        service.renderTemplateContent(template, {
          includeSubject: true,
          includeBody: false,
        }),
      ).rejects.toThrow('Missing personalisation for template ID template-123: subjectName')
    })

    it('should throw BadRequestException for missing Mustache personalisation', async () => {
      const template: Template = {
        ...mockMustacheTemplate,
        body: '{{#items}}Item{{/items}} for {{firstName}}',
      }

      await expect(service.renderTemplateContent(template, {})).rejects.toThrow(
        'Missing personalisation for template ID template-123: items, firstName, caseNumber',
      )
    })

    it('should not require Mustache section item fields as top-level personalisation keys', async () => {
      const template: Template = {
        ...mockMustacheTemplate,
        subject: '{{#isSubscribed}}Digest{{/isSubscribed}}',
        body: `
          Hello {{name}}
          {{#articles}}
          Article: {{title}}
          By {{author}}
          {{/articles}}
          {{#categories}}
          Category: {{label}}
          {{/categories}}
        `,
      }

      await expect(service.renderTemplateContent(template, {})).rejects.toThrow(
        'Missing personalisation for template ID template-123: name, articles, categories, isSubscribed',
      )
    })

    it('should allow Mustache section templates through validation when top-level keys are present', async () => {
      const template: Template = {
        ...mockMustacheTemplate,
        subject: '{{#isSubscribed}}Digest{{/isSubscribed}}',
        body: `
          Hello {{name}}
          {{#articles}}
          Article: {{title}}
          By {{author}}
          {{/articles}}
          {{#categories}}
          Category: {{label}}
          {{/categories}}
        `,
      }

      const result = await service.renderTemplateContent(template, {
        name: 'Alice',
        isSubscribed: true,
        articles: [{ title: 'One', author: 'A' }],
        categories: [{ label: 'News' }],
      })

      expect(result.subject).toBe('Digest')
      expect(result.body).toContain('Hello Alice')
      expect(result.bodyType).toBe('markdown')
    })

    it('should validate MJML placeholders using existing MJML renderer syntax', async () => {
      const template: Template = {
        ...mockMjmlTemplate,
        subject: 'Welcome {{userName}}',
        body: `
          <mjml>
            <mj-body>
              <mj-section>
                <mj-column>
                  <mj-text>{{#if isApproved}}Approved{{/if}} case {{caseNumber}}</mj-text>
                </mj-column>
              </mj-section>
            </mj-body>
          </mjml>
        `,
      }

      await expect(service.renderTemplateContent(template, {})).rejects.toThrow(
        'Missing personalisation for template ID template-123: isApproved, caseNumber, userName',
      )
    })

    it('should validate email subject and body placeholders together', async () => {
      const template: Template = {
        ...mockTemplate,
        subject: 'Subject {{subjectKey}}',
        body: 'Body {{bodyKey}}',
      }

      await expect(service.renderTemplateContent(template, {})).rejects.toThrow(
        'Missing personalisation for template ID template-123: bodyKey, subjectKey',
      )
    })

    it('should validate only SMS body placeholders', async () => {
      const template: Template = {
        ...mockMustacheTemplate,
        channelCode: NotificationChannel.SMS,
        subject: 'Ignored {{subjectKey}}',
        body: 'SMS {{bodyKey}}',
      }

      await expect(service.renderTemplateContent(template, {})).rejects.toThrow(
        'Missing personalisation for template ID template-123: bodyKey',
      )
    })

    it('should render successfully when all required keys are present', async () => {
      const result = await service.renderTemplateContent(mockMustacheTemplate, {
        firstName: 'Alice',
        caseNumber: 'C-123',
      })

      expect(result.subject).toBe('Case C-123')
      expect(result.body).toBe('Hello Alice')
      expect(result.bodyType).toBe('markdown')
    })

    it('should preserve rendering output when all required keys are present', async () => {
      const template: Template = {
        ...mockTemplate,
        subject: 'Welcome {{siteName}}',
        body: '{{#if isApproved}}Approved{{else}}Pending{{/if}} for {{caseNumber}}',
      }

      const result = await service.renderTemplateContent(template, {
        siteName: 'MyApp',
        isApproved: true,
        caseNumber: 'C-100',
      })

      expect(result.subject).toBe('Welcome MyApp')
      expect(result.body).toBe('Approved for C-100')
      expect(result.bodyType).toBe('markdown')
    })
  })

  describe('createTemplate', () => {
    it('should create template with bodyType field', async () => {
      const createDto = {
        name: 'Test Template',
        description: 'Test',
        channelCode: NotificationChannel.EMAIL,
        subject: 'Subject',
        body: '# Body',
        engineCode: TemplateEngine.HANDLEBARS,
        bodyType: 'markdown' as const,
      }

      mockRepository.create.mockResolvedValue({
        ...mockTemplate,
        ...createDto,
      })
      mockRepository.createVersion.mockResolvedValue({})

      await service.createTemplate('tenant-123', createDto, 'user-123')

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          bodyType: 'markdown',
        }),
      )

      expect(mockRepository.createVersion).toHaveBeenCalledWith(
        expect.objectContaining({
          bodyType: 'markdown',
        }),
      )
    })

    it('should default bodyType to markdown if not provided', async () => {
      const createDto = {
        name: 'Test Template',
        description: 'Test',
        channelCode: NotificationChannel.EMAIL,
        subject: 'Subject',
        body: 'Body',
        engineCode: TemplateEngine.HANDLEBARS,
      }

      mockRepository.create.mockResolvedValue({
        ...mockTemplate,
        ...createDto,
        bodyType: 'markdown',
      })
      mockRepository.createVersion.mockResolvedValue({})

      await service.createTemplate('tenant-123', createDto, 'user-123')

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          bodyType: 'markdown',
        }),
      )
    })

    it('should store null bodyType for MJML when not provided', async () => {
      const createDto = {
        name: 'MJML Template',
        description: 'Test',
        channelCode: NotificationChannel.EMAIL,
        subject: 'Subject',
        body: '<mjml><mj-body><mj-section><mj-column><mj-text>Hello</mj-text></mj-column></mj-section></mj-body></mjml>',
        engineCode: TemplateEngine.MJML,
      }

      mockRepository.create.mockResolvedValue({
        ...mockTemplate,
        ...createDto,
        bodyType: null,
      })
      mockRepository.createVersion.mockResolvedValue({})

      await service.createTemplate('tenant-123', createDto, 'user-123')

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          engineCode: TemplateEngine.MJML,
          bodyType: null,
        }),
      )

      expect(mockRepository.createVersion).toHaveBeenCalledWith(
        expect.objectContaining({
          bodyType: null,
        }),
      )
    })
  })

  describe('updateTemplate', () => {
    it('should update bodyType field', async () => {
      const updateDto = {
        bodyType: 'markdown' as const,
      }

      mockRepository.findById.mockResolvedValue(mockTemplate)
      mockRepository.update.mockResolvedValue({
        ...mockTemplate,
        ...updateDto,
      })

      await service.updateTemplate('tenant-123', 'template-123', updateDto, 'user-123')

      expect(mockRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          bodyType: 'markdown',
        }),
      )
    })

    it('should preserve bodyType when not provided in update', async () => {
      const updateDto = {
        name: 'Updated Name',
      }

      mockRepository.findById.mockResolvedValue(mockMarkdownTemplate)
      mockRepository.update.mockResolvedValue({
        ...mockMarkdownTemplate,
        ...updateDto,
      })

      await service.updateTemplate('tenant-123', 'template-123', updateDto, 'user-123')

      expect(mockRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          bodyType: 'markdown',
        }),
      )
    })

    it('should clear bodyType when template engine changes to MJML', async () => {
      const updateDto = {
        engineCode: TemplateEngine.MJML,
      }

      mockRepository.findById.mockResolvedValue(mockTemplate)
      mockRepository.update.mockResolvedValue({
        ...mockTemplate,
        ...updateDto,
        bodyType: null,
      })

      await service.updateTemplate('tenant-123', 'template-123', updateDto, 'user-123')

      expect(mockRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          engineCode: TemplateEngine.MJML,
          bodyType: null,
        }),
      )
    })
  })

  describe('previewTemplate', () => {
    it('should preview template returning raw markdown with bodyType flag', async () => {
      mockRepository.findById.mockResolvedValue(mockMarkdownTemplate)

      const result = await service.previewTemplate('tenant-123', 'template-123', {
        params: { userName: 'John', siteName: 'MyApp' },
      })

      expect(result.body).toContain('# Welcome John')
      expect(result.body).toContain('**bold**')
      expect(result.bodyType).toBe('markdown')
    })
  })
})
