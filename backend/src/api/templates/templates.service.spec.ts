import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { TemplatesService } from './templates.service'
import { TemplatesRepository } from './templates.repository'
import { Template } from './entities/template.entity'
import { TemplateEngine } from '../../enum/template-engine.enum'
import { NotificationChannel } from '../../enum/notification-channel.enum'

describe('TemplatesService', () => {
  let service: TemplatesService
  let repository: TemplatesRepository

  const mockTemplate: Template = {
    id: 'template-123',
    tenantId: 'tenant-123',
    name: 'Welcome Email',
    description: 'Welcome template',
    channelCode: NotificationChannel.EMAIL,
    subject: 'Welcome to {{siteName}}!',
    body: 'Hello {{userName}}, welcome!',
    engineCode: TemplateEngine.HANDLEBARS,
    renderAsMarkdown: false,
    version: 1,
    active: true,
    createdBy: 'user-123',
    createdAt: new Date(),
    updatedBy: 'user-123',
    updatedAt: new Date(),
  }

  const mockMarkdownTemplate: Template = {
    ...mockTemplate,
    renderAsMarkdown: true,
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplatesService,
        {
          provide: TemplatesRepository,
          useValue: mockRepository,
        },
      ],
    }).compile()

    service = module.get<TemplatesService>(TemplatesService)
    repository = module.get<TemplatesRepository>(TemplatesRepository)

    vi.clearAllMocks()
  })

  describe('renderTemplateContent', () => {
    it('should render template without markdown when renderAsMarkdown is false', () => {
      const result = service.renderTemplateContent(mockTemplate, {
        userName: 'John',
        siteName: 'MyApp',
      })

      expect(result.subject).toBe('Welcome to MyApp!')
      expect(result.body).toBe('Hello John, welcome!')
    })

    it('should render subject without markdown conversion (even if renderAsMarkdown is true)', () => {
      const result = service.renderTemplateContent(mockMarkdownTemplate, {
        userName: 'John',
      })

      // Subject should be plain text, not wrapped in <p> tags
      expect(result.subject).not.toContain('<p>')
      expect(result.subject).not.toContain('</p>')
    })

    it('should convert body to HTML when renderAsMarkdown is true', () => {
      const result = service.renderTemplateContent(mockMarkdownTemplate, {
        userName: 'John',
      })

      // Body should be converted to HTML
      expect(result.body).toContain('<h1>')
      expect(result.body).toContain('Welcome John')
      expect(result.body).toContain('<strong>')
      expect(result.body).toContain('<a ')
    })

    it('should handle markdown with undefined template values', () => {
      const template: Template = {
        ...mockMarkdownTemplate,
        body: '# Title\n\nHello {{unknownVar}}, welcome!',
      }

      const result = service.renderTemplateContent(template, {})

      expect(result.body).toContain('<h1>')
      expect(result.body).toContain('Hello , welcome!') // undefined vars render as empty
    })

    it('should handle markdown with special characters', () => {
      const template: Template = {
        ...mockMarkdownTemplate,
        body: '# Title\n\n**Bold** and _italic_ & special chars',
      }

      const result = service.renderTemplateContent(template, {})

      expect(result.body).toContain('<strong>Bold</strong>')
      expect(result.body).toContain('<em>italic</em>')
      expect(result.body).toContain('special chars')
    })

    it('should handle markdown with code blocks', () => {
      const template: Template = {
        ...mockMarkdownTemplate,
        body: '# Code Example\n\n```javascript\nconst x = 5;\n```',
      }

      const result = service.renderTemplateContent(template, {})

      expect(result.body).toContain('<pre><code')
      expect(result.body).toContain('const x = 5;')
    })

    it('should handle markdown with lists', () => {
      const template: Template = {
        ...mockMarkdownTemplate,
        body: '# Items\n\n- Item 1\n- Item 2\n- Item 3',
      }

      const result = service.renderTemplateContent(template, {})

      expect(result.body).toContain('<ul>')
      expect(result.body).toContain('<li>')
    })

    it('should handle markdown with tables', () => {
      const template: Template = {
        ...mockMarkdownTemplate,
        body: '| Name | Value |\n|------|-------|\n| A | 1 |\n| B | 2 |',
      }

      const result = service.renderTemplateContent(template, {})

      expect(result.body).toContain('<table>')
      expect(result.body).toContain('<tr>')
      expect(result.body).toContain('<td>')
    })

    it('should preserve undefined personalisation', () => {
      const result = service.renderTemplateContent(mockTemplate)

      expect(result).toHaveProperty('subject')
      expect(result).toHaveProperty('body')
    })
  })

  describe('createTemplate', () => {
    it('should create template with renderAsMarkdown flag', async () => {
      const createDto = {
        name: 'Test Template',
        description: 'Test',
        channelCode: NotificationChannel.EMAIL,
        subject: 'Subject',
        body: '# Body',
        engineCode: TemplateEngine.HANDLEBARS,
        renderAsMarkdown: true,
      }

      mockRepository.create.mockResolvedValue({
        ...mockTemplate,
        ...createDto,
      })
      mockRepository.createVersion.mockResolvedValue({})

      const result = await service.createTemplate('tenant-123', createDto, 'user-123')

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          renderAsMarkdown: true,
        }),
      )

      expect(mockRepository.createVersion).toHaveBeenCalledWith(
        expect.objectContaining({
          renderAsMarkdown: true,
        }),
      )
    })

    it('should default renderAsMarkdown to false if not provided', async () => {
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
        renderAsMarkdown: false,
      })
      mockRepository.createVersion.mockResolvedValue({})

      await service.createTemplate('tenant-123', createDto, 'user-123')

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          renderAsMarkdown: false,
        }),
      )
    })
  })

  describe('updateTemplate', () => {
    it('should update renderAsMarkdown flag', async () => {
      const updateDto = {
        renderAsMarkdown: true,
      }

      mockRepository.findById.mockResolvedValue(mockTemplate)
      mockRepository.update.mockResolvedValue({
        ...mockTemplate,
        ...updateDto,
      })

      await service.updateTemplate('tenant-123', 'template-123', updateDto, 'user-123')

      expect(mockRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          renderAsMarkdown: true,
        }),
      )
    })

    it('should preserve renderAsMarkdown when not provided in update', async () => {
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
          renderAsMarkdown: true,
        }),
      )
    })
  })

  describe('previewTemplate', () => {
    it('should preview template with markdown rendering enabled', async () => {
      mockRepository.findById.mockResolvedValue(mockMarkdownTemplate)

      const result = await service.previewTemplate('tenant-123', 'template-123', {
        personalisation: { userName: 'John' },
      })

      expect(result.body).toContain('<h1>')
      expect(result.subject).not.toContain('<p>')
    })
  })
})
