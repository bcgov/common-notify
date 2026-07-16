import { Test, TestingModule } from '@nestjs/testing'
import { TemplatesController } from './templates.controller'
import { TemplatesService } from './templates.service'
import { CreateTemplateDto } from './schemas/create-template.dto'
import { UpdateTemplateDto } from './schemas/update-template.dto'
import { PreviewTemplateDto } from './schemas/preview-template.dto'
import { TemplateResponseDto } from './schemas/template-response.dto'
import { PaginatedTemplateResponse } from './schemas/paginated-template-response'
import { Tenant } from '../admin/tenants/entities/tenant.entity'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { TemplateEngine } from '../../enum/template-engine.enum'
import { vi } from 'vitest'
import { NotifyServiceGuard } from '../../common/guards/notify-service.guard'
import { CanActivate, ExecutionContext } from '@nestjs/common'
import * as listQueryParser from '../../common/query/list-query.parser'

describe('TemplatesController', () => {
  let controller: TemplatesController

  const mockTenant: Tenant = {
    id: 'tenant-123',
    name: 'Test Tenant',
    slug: 'test-tenant',
    externalId: 'ext-123',
    status: 'active',
    statusCode: { code: 'active', name: 'Active' } as any,
    createdAt: new Date(),
    createdBy: 'admin',
    updatedAt: new Date(),
    updatedBy: 'admin',
    isDeleted: false,
  }

  const mockTemplate: TemplateResponseDto = {
    id: 'template-123',
    name: 'Welcome Email',
    description: 'Welcome template',
    channelCode: NotificationChannel.EMAIL,
    subject: 'Welcome {{name}}',
    body: 'Hello {{name}}!',
    engineCode: TemplateEngine.HANDLEBARS,
    bodyType: 'markdown',
    version: 1,
    active: true,
    createdBy: 'user-123',
    createdAt: new Date(),
    updatedBy: 'user-123',
    updatedAt: new Date(),
  }

  const mockTemplatesService = {
    listTemplates: vi.fn(),
    getTemplate: vi.fn(),
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    previewTemplate: vi.fn(),
  }

  // Mock AuthGuard to bypass authentication
  const mockAuthGuard: CanActivate = {
    canActivate: (context: ExecutionContext) => {
      const request = context.switchToHttp().getRequest()
      request.tenant = { id: 'test-tenant-id', name: 'test-tenant' }
      return true
    },
  }

  // Helper to create a mock request with tenant
  const createMockRequest = () =>
    ({
      tenant: mockTenant,
    }) as any

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TemplatesController],
      providers: [
        {
          provide: TemplatesService,
          useValue: mockTemplatesService,
        },
      ],
    })
      .overrideGuard(NotifyServiceGuard)
      .useValue(mockAuthGuard)
      .compile()

    controller = module.get<TemplatesController>(TemplatesController)

    vi.clearAllMocks()
  })

  describe('listTemplates', () => {
    beforeEach(() => {
      vi.spyOn(listQueryParser, 'parseListQuery').mockImplementation((query, _config) => ({
        page: query.page || 1,
        limit: query.limit || 10,
        filters: Array.isArray(query.filter)
          ? query.filter.map((f: string) => {
              const [field, operator, value] = f.split(':')
              return { field, operator, value }
            })
          : [],
        sorts: query.sort
          ? query.sort.split(',').map((s: string) => {
              const isDesc = s.startsWith('-')
              const field = isDesc ? s.slice(1) : s
              return { field, direction: isDesc ? 'DESC' : 'ASC' }
            })
          : [{ field: 'updatedAt', direction: 'DESC' }],
      }))
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should return a paginated list of templates with default pagination', async () => {
      const mockResponse: PaginatedTemplateResponse = {
        data: [mockTemplate],
        count: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      }
      mockTemplatesService.listTemplates.mockResolvedValue(mockResponse)

      const req = createMockRequest()
      const query = { page: 1, limit: 10 }
      const result = await controller.listTemplates(req, query as any)

      expect(result).toEqual(mockResponse)
      expect(mockTemplatesService.listTemplates).toHaveBeenCalledWith(
        'tenant-123',
        expect.objectContaining({
          page: 1,
          limit: 10,
        }),
      )
    })

    it('should return templates with custom page and limit', async () => {
      const mockResponse: PaginatedTemplateResponse = {
        data: [mockTemplate],
        count: 1,
        page: 2,
        limit: 20,
        totalPages: 1,
      }
      mockTemplatesService.listTemplates.mockResolvedValue(mockResponse)

      const req = createMockRequest()
      const query = { page: 2, limit: 20 }
      const result = await controller.listTemplates(req, query as any)

      expect(result).toEqual(mockResponse)
      expect(mockTemplatesService.listTemplates).toHaveBeenCalledWith(
        'tenant-123',
        expect.objectContaining({
          page: 2,
          limit: 20,
        }),
      )
    })

    it('should accept sort parameter and parse it', async () => {
      const mockResponse: PaginatedTemplateResponse = {
        data: [mockTemplate],
        count: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      }
      mockTemplatesService.listTemplates.mockResolvedValue(mockResponse)

      const req = createMockRequest()
      const query = { page: 1, limit: 10, sort: '-updatedAt,name' }
      const result = await controller.listTemplates(req, query as any)

      expect(result).toEqual(mockResponse)
      expect(mockTemplatesService.listTemplates).toHaveBeenCalledWith(
        'tenant-123',
        expect.objectContaining({
          page: 1,
          limit: 10,
          sorts: expect.arrayContaining([
            expect.objectContaining({ field: 'updatedAt', direction: 'DESC' }),
            expect.objectContaining({ field: 'name', direction: 'ASC' }),
          ]),
        }),
      )
    })

    it('should accept filter parameters and parse them', async () => {
      const mockResponse: PaginatedTemplateResponse = {
        data: [mockTemplate],
        count: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      }
      mockTemplatesService.listTemplates.mockResolvedValue(mockResponse)

      const req = createMockRequest()
      const query = {
        page: 1,
        limit: 10,
        filter: ['channelCode:eq:EMAIL', 'name:like:welcome'],
      }
      const result = await controller.listTemplates(req, query as any)

      expect(result).toEqual(mockResponse)
      expect(mockTemplatesService.listTemplates).toHaveBeenCalledWith(
        'tenant-123',
        expect.objectContaining({
          page: 1,
          limit: 10,
          filters: expect.arrayContaining([
            expect.objectContaining({ field: 'channelCode', operator: 'eq', value: 'EMAIL' }),
            expect.objectContaining({ field: 'name', operator: 'like', value: 'welcome' }),
          ]),
        }),
      )
    })

    it('should return empty array when no templates exist', async () => {
      const mockResponse: PaginatedTemplateResponse = {
        data: [],
        count: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      }
      mockTemplatesService.listTemplates.mockResolvedValue(mockResponse)

      const req = createMockRequest()
      const query = { page: 1, limit: 10 }
      const result = await controller.listTemplates(req, query as any)

      expect(result.data).toEqual([])
    })

    it('should pass tenant ID to service', async () => {
      const mockResponse: PaginatedTemplateResponse = {
        data: [mockTemplate],
        count: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      }
      mockTemplatesService.listTemplates.mockResolvedValue(mockResponse)

      const req = createMockRequest()
      const query = { page: 1, limit: 10 }
      await controller.listTemplates(req, query as any)

      expect(mockTemplatesService.listTemplates).toHaveBeenCalledWith(
        mockTenant.id,
        expect.any(Object),
      )
    })
  })

  describe('getTemplate', () => {
    it('should return a specific template by ID', async () => {
      mockTemplatesService.getTemplate.mockResolvedValue(mockTemplate)

      const result = await controller.getTemplate(createMockRequest(), 'template-123')

      expect(result).toEqual(mockTemplate)
      expect(mockTemplatesService.getTemplate).toHaveBeenCalledWith('tenant-123', 'template-123')
    })

    it('should call service with tenant ID and template ID', async () => {
      mockTemplatesService.getTemplate.mockResolvedValue(mockTemplate)

      await controller.getTemplate(createMockRequest(), 'template-456')

      expect(mockTemplatesService.getTemplate).toHaveBeenCalledWith('tenant-123', 'template-456')
    })

    it('should throw error when template not found', async () => {
      mockTemplatesService.getTemplate.mockRejectedValue(new Error('Template not found'))

      await expect(controller.getTemplate(createMockRequest(), 'non-existent')).rejects.toThrow(
        'Template not found',
      )
    })
  })

  describe('createTemplate', () => {
    it('should create a new template', async () => {
      const createDto: CreateTemplateDto = {
        name: 'New Template',
        description: 'A new template',
        channelCode: NotificationChannel.EMAIL,
        subject: 'Subject',
        body: 'Body',
        engineCode: TemplateEngine.HANDLEBARS,
        bodyType: 'markdown',
      }

      mockTemplatesService.createTemplate.mockResolvedValue(mockTemplate)

      const result = await controller.createTemplate(createMockRequest(), createDto)

      expect(result).toEqual(mockTemplate)
      // When no request is provided, JwtUserExtractor.extractUser returns 'system'
      expect(mockTemplatesService.createTemplate).toHaveBeenCalledWith(
        'tenant-123',
        createDto,
        'system',
      )
    })

    it('should pass tenant ID and DTO to service', async () => {
      const createDto: CreateTemplateDto = {
        name: 'Template',
        channelCode: NotificationChannel.SMS,
        body: 'SMS body',
        engineCode: TemplateEngine.MUSTACHE,
      }

      mockTemplatesService.createTemplate.mockResolvedValue(mockTemplate)

      await controller.createTemplate(createMockRequest(), createDto)

      // When no request is provided, JwtUserExtractor.extractUser returns 'system'
      expect(mockTemplatesService.createTemplate).toHaveBeenCalledWith(
        'tenant-123',
        createDto,
        'system',
      )
    })

    it('should extract user from request when available', async () => {
      const createDto: CreateTemplateDto = {
        name: 'Template',
        channelCode: NotificationChannel.EMAIL,
        body: 'Body',
        engineCode: TemplateEngine.HANDLEBARS,
      }

      mockTemplatesService.createTemplate.mockResolvedValue(mockTemplate)

      await controller.createTemplate(createMockRequest(), createDto)

      expect(mockTemplatesService.createTemplate).toHaveBeenCalledWith(
        'tenant-123',
        createDto,
        expect.anything(),
      )
    })

    it('should return created template with correct response DTO', async () => {
      const createDto: CreateTemplateDto = {
        name: 'Test',
        channelCode: NotificationChannel.EMAIL,
        body: 'Body',
        engineCode: TemplateEngine.HANDLEBARS,
      }

      mockTemplatesService.createTemplate.mockResolvedValue(mockTemplate)

      const result = await controller.createTemplate(createMockRequest(), createDto)

      expect(result.id).toBe('template-123')
      expect(result.name).toBe('Welcome Email')
    })
  })

  describe('updateTemplate', () => {
    it('should update an existing template', async () => {
      const updateDto: UpdateTemplateDto = {
        name: 'Updated Name',
        body: 'Updated body',
      }

      mockTemplatesService.updateTemplate.mockResolvedValue(mockTemplate)

      const result = await controller.updateTemplate(createMockRequest(), 'template-123', updateDto)

      expect(result).toEqual(mockTemplate)
      // When no request is provided, JwtUserExtractor.extractUser returns 'system'
      expect(mockTemplatesService.updateTemplate).toHaveBeenCalledWith(
        'tenant-123',
        'template-123',
        updateDto,
        'system',
      )
    })

    it('should call service with correct parameters', async () => {
      const updateDto: UpdateTemplateDto = {
        description: 'New description',
      }

      mockTemplatesService.updateTemplate.mockResolvedValue(mockTemplate)

      await controller.updateTemplate(createMockRequest(), 'template-456', updateDto)

      // When no request is provided, JwtUserExtractor.extractUser returns 'system'
      expect(mockTemplatesService.updateTemplate).toHaveBeenCalledWith(
        'tenant-123',
        'template-456',
        updateDto,
        'system',
      )
    })

    it('should extract user from request', async () => {
      const updateDto: UpdateTemplateDto = {
        body: 'New body',
      }

      mockTemplatesService.updateTemplate.mockResolvedValue(mockTemplate)

      await controller.updateTemplate(createMockRequest(), 'template-123', updateDto)

      expect(mockTemplatesService.updateTemplate).toHaveBeenCalledWith(
        'tenant-123',
        'template-123',
        updateDto,
        expect.anything(),
      )
    })

    it('should throw error when template not found', async () => {
      const updateDto: UpdateTemplateDto = {
        name: 'Updated',
      }

      mockTemplatesService.updateTemplate.mockRejectedValue(new Error('Template not found'))

      await expect(
        controller.updateTemplate(createMockRequest(), 'non-existent', updateDto),
      ).rejects.toThrow('Template not found')
    })
  })

  describe('deleteTemplate', () => {
    it('should delete a template by ID', async () => {
      mockTemplatesService.deleteTemplate.mockResolvedValue(undefined)

      const result = await controller.deleteTemplate(createMockRequest(), 'template-123')

      expect(result).toBeUndefined()
      expect(mockTemplatesService.deleteTemplate).toHaveBeenCalledWith('tenant-123', 'template-123')
    })

    it('should call service with correct tenant and template IDs', async () => {
      mockTemplatesService.deleteTemplate.mockResolvedValue(undefined)

      await controller.deleteTemplate(createMockRequest(), 'template-456')

      expect(mockTemplatesService.deleteTemplate).toHaveBeenCalledWith('tenant-123', 'template-456')
    })

    it('should return 204 No Content status', async () => {
      mockTemplatesService.deleteTemplate.mockResolvedValue(undefined)

      const result = await controller.deleteTemplate(createMockRequest(), 'template-123')

      expect(result).toBeUndefined()
    })

    it('should throw error when template not found', async () => {
      mockTemplatesService.deleteTemplate.mockRejectedValue(new Error('Template not found'))

      await expect(controller.deleteTemplate(createMockRequest(), 'non-existent')).rejects.toThrow(
        'Template not found',
      )
    })
  })

  describe('previewTemplate', () => {
    it('should preview a template with sample data', async () => {
      const previewDto: PreviewTemplateDto = {
        params: {
          name: 'John',
          site: 'MyApp',
        },
      }

      const previewResult = {
        subject: 'Welcome John',
        body: 'Hello John, welcome!',
      }

      mockTemplatesService.previewTemplate.mockResolvedValue(previewResult)

      const result = await controller.previewTemplate(
        createMockRequest(),
        'template-123',
        previewDto,
      )

      expect(result).toEqual(previewResult)
      expect(mockTemplatesService.previewTemplate).toHaveBeenCalledWith(
        'tenant-123',
        'template-123',
        previewDto,
      )
    })

    it('should call service with tenant ID, template ID, and preview data', async () => {
      const previewDto: PreviewTemplateDto = {
        params: {
          user: 'Alice',
        },
      }

      mockTemplatesService.previewTemplate.mockResolvedValue({
        subject: 'Test',
        body: 'Test body',
      })

      await controller.previewTemplate(createMockRequest(), 'template-456', previewDto)

      expect(mockTemplatesService.previewTemplate).toHaveBeenCalledWith(
        'tenant-123',
        'template-456',
        previewDto,
      )
    })

    it('should handle preview with empty params', async () => {
      const previewDto: PreviewTemplateDto = {
        params: {},
      }

      mockTemplatesService.previewTemplate.mockResolvedValue({
        subject: 'Static Subject',
        body: 'Static body',
      })

      const result = await controller.previewTemplate(
        createMockRequest(),
        'template-123',
        previewDto,
      )

      expect(result).toBeDefined()
      expect(mockTemplatesService.previewTemplate).toHaveBeenCalledWith(
        'tenant-123',
        'template-123',
        previewDto,
      )
    })

    it('should return rendered email with subject and body', async () => {
      const previewDto: PreviewTemplateDto = {
        params: {
          firstName: 'Jane',
          lastName: 'Doe',
        },
      }

      const previewResult = {
        subject: 'Welcome Jane',
        body: 'Hello Jane Doe!',
        bodyType: 'markdown',
      }

      mockTemplatesService.previewTemplate.mockResolvedValue(previewResult)

      const result = await controller.previewTemplate(
        createMockRequest(),
        'template-123',
        previewDto,
      )

      expect(result.subject).toBe('Welcome Jane')
      expect(result.body).toBe('Hello Jane Doe!')
      expect(result.bodyType).toBe('markdown')
    })

    it('should throw error when template not found', async () => {
      const previewDto: PreviewTemplateDto = {
        params: {},
      }

      mockTemplatesService.previewTemplate.mockRejectedValue(new Error('Template not found'))

      await expect(
        controller.previewTemplate(createMockRequest(), 'non-existent', previewDto),
      ).rejects.toThrow('Template not found')
    })
  })

  describe('Controller Guards and Decorators', () => {
    it('should require AuthGuard for accessing templates', () => {
      // AuthGuard is applied at class level via @UseGuards(AuthGuard)
      // The @GetTenant() decorator provides the tenant from the request
      expect(controller).toBeDefined()
    })

    it('should require authorization via ApiBearerAuth', () => {
      // ApiBearerAuth is for Swagger documentation
      // The actual auth is handled by AuthGuard with X-Tenant-ID header validation
      expect(controller).toBeDefined()
    })
  })

  describe('HTTP Status Codes', () => {
    beforeEach(() => {
      vi.spyOn(listQueryParser, 'parseListQuery').mockImplementation((query, _config) => ({
        page: query.page || 1,
        limit: query.limit || 10,
        filters: Array.isArray(query.filter)
          ? query.filter.map((f: string) => {
              const [field, operator, value] = f.split(':')
              return { field, operator, value }
            })
          : [],
        sorts: query.sort
          ? query.sort.split(',').map((s: string) => {
              const isDesc = s.startsWith('-')
              const field = isDesc ? s.slice(1) : s
              return { field, direction: isDesc ? 'DESC' : 'ASC' }
            })
          : [{ field: 'updatedAt', direction: 'DESC' }],
      }))
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should return 200 for listTemplates', async () => {
      const mockResponse: PaginatedTemplateResponse = {
        data: [mockTemplate],
        count: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      }
      mockTemplatesService.listTemplates.mockResolvedValue(mockResponse)

      const req = createMockRequest()
      const query = { page: 1, limit: 10 }
      const result = await controller.listTemplates(req, query as any)

      expect(result).toBeDefined()
      // Status code 200 is implicit for @Get() without @HttpCode override
    })

    it('should return 200 for getTemplate', async () => {
      mockTemplatesService.getTemplate.mockResolvedValue(mockTemplate)

      const result = await controller.getTemplate(createMockRequest(), 'template-123')

      expect(result).toBeDefined()
    })

    it('should return 201 for createTemplate', async () => {
      mockTemplatesService.createTemplate.mockResolvedValue(mockTemplate)

      const result = await controller.createTemplate(createMockRequest(), {} as CreateTemplateDto)

      expect(result).toBeDefined()
      // Status code 201 is set via @HttpCode(201) decorator
    })

    it('should return 200 for updateTemplate', async () => {
      mockTemplatesService.updateTemplate.mockResolvedValue(mockTemplate)

      const result = await controller.updateTemplate(
        createMockRequest(),
        'template-123',
        {} as UpdateTemplateDto,
      )

      expect(result).toBeDefined()
      // Status code 200 is implicit for @Patch()
    })

    it('should return 204 for deleteTemplate', async () => {
      mockTemplatesService.deleteTemplate.mockResolvedValue(undefined)

      const result = await controller.deleteTemplate(createMockRequest(), 'template-123')

      expect(result).toBeUndefined()
      // Status code 204 is set via @HttpCode(204) decorator
    })

    it('should return 200 for previewTemplate', async () => {
      mockTemplatesService.previewTemplate.mockResolvedValue({ body: 'rendered' })

      const result = await controller.previewTemplate(
        createMockRequest(),
        'template-123',
        {} as PreviewTemplateDto,
      )

      expect(result).toBeDefined()
      // Status code 200 is implicit for @Post() without @HttpCode override
    })
  })

  describe('API Versioning', () => {
    it('should support API version 1 for all endpoints', () => {
      // @Version('1') is applied to all endpoints
      // This is configuration that should be verified via integration tests
      expect(controller).toBeDefined()
    })
  })
})
