import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
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
    name: 'Welcome Email',
    description: 'Welcome template',
    channelCode: NotificationChannel.EMAIL,
    subject: 'Welcome to {{siteName}}!',
    body: 'Hello {{userName}}, welcome!',
    engineCode: TemplateEngine.HANDLEBARS,
    bodyType: 'html',
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
    it('should render template and return with bodyType', async () => {
      const result = await service.renderTemplateContent(mockTemplate, {
        userName: 'John',
        siteName: 'MyApp',
      })

      expect(result.subject).toBe('Welcome to MyApp!')
      expect(result.body).toBe('Hello John, welcome!')
      expect(result.bodyType).toBe('html')
    })

    it('should render markdown template and return bodyType without converting', async () => {
      const result = await service.renderTemplateContent(mockMarkdownTemplate, {
        userName: 'John',
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
      })

      // Subject should be plain text, not wrapped in <p> tags or HTML
      expect(result.subject).not.toContain('<p>')
      expect(result.subject).not.toContain('</p>')
      expect(result.subject).not.toContain('<h1>')
    })

    it('should handle markdown with undefined template values', async () => {
      const template: Template = {
        ...mockMarkdownTemplate,
        body: '# Title\n\nHello {{unknownVar}}, welcome!',
      }

      const result = await service.renderTemplateContent(template, {})

      expect(result.body).toContain('# Title')
      expect(result.body).toContain('Hello , welcome!') // undefined vars render as empty
      expect(result.bodyType).toBe('markdown') // markdown is returned raw, adapter converts to HTML
    })

    it('should handle markdown with special characters', async () => {
      const template: Template = {
        ...mockMarkdownTemplate,
        body: '# Title\n\n**Bold** and _italic_ & special chars',
      }

      const result = await service.renderTemplateContent(template, {})

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

      const result = await service.renderTemplateContent(template, {})

      expect(result.body).toContain('```javascript')
      expect(result.body).toContain('const x = 5;')
      expect(result.bodyType).toBe('markdown')
    })

    it('should handle markdown with lists', async () => {
      const template: Template = {
        ...mockMarkdownTemplate,
        body: '# Items\n\n- Item 1\n- Item 2\n- Item 3',
      }

      const result = await service.renderTemplateContent(template, {})

      expect(result.body).toContain('- Item 1')
      expect(result.body).toContain('- Item 2')
      expect(result.bodyType).toBe('markdown')
    })

    it('should handle markdown with tables', async () => {
      const template: Template = {
        ...mockMarkdownTemplate,
        body: '| Name | Value |\n|------|-------|\n| A | 1 |\n| B | 2 |',
      }

      const result = await service.renderTemplateContent(template, {})

      expect(result.body).toContain('| Name | Value |')
      expect(result.body).toContain('| A | 1 |')
      expect(result.bodyType).toBe('markdown')
    })

    it('should preserve undefined personalisation', async () => {
      const result = await service.renderTemplateContent(mockTemplate)

      expect(result).toHaveProperty('subject')
      expect(result).toHaveProperty('body')
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

    it('should default bodyType to html if not provided', async () => {
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
        bodyType: 'html',
      })
      mockRepository.createVersion.mockResolvedValue({})

      await service.createTemplate('tenant-123', createDto, 'user-123')

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          bodyType: 'html',
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
  })

  describe('previewTemplate', () => {
    it('should preview template returning raw markdown with bodyType flag', async () => {
      mockRepository.findById.mockResolvedValue(mockMarkdownTemplate)

      const result = await service.previewTemplate('tenant-123', 'template-123', {
        params: { userName: 'John' },
      })

      expect(result.body).toContain('# Welcome John')
      expect(result.body).toContain('**bold**')
      expect(result.bodyType).toBe('markdown')
    })
  })
})
