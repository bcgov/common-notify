import type { AxiosError } from 'axios'
import { get, post, generateApiParameters, STATUS_CODES } from '@/common/api'
import type { PaginatedTemplateResponse } from '@/interfaces/PaginatedNotificationResponse'

export enum NotificationChannel {
  EMAIL = 'EMAIL',
  SMS = 'SMS',
}

export enum TemplateEngine {
  HANDLEBARS = 'handlebars',
  MUSTACHE = 'mustache',
  LEGACY_GC_NOTIFY = 'legacy_gc_notify',
}

export enum TemplateBodyType {
  HTML = 'html',
  MARKDOWN = 'markdown',
}

export interface TemplateResponse {
  id: string
  name: string
  description?: string
  channelCode: NotificationChannel
  subject?: string
  body: string
  bodyType?: TemplateBodyType
  engineCode: TemplateEngine
  version: number
  active: boolean
  createdBy: string
  createdAt: string
  updatedBy: string
  updatedAt: string
}

export interface GetTemplatesResponse {
  templates: TemplateResponse[]
  count: number
}

/**
 * Templates API for managing notification templates
 * Endpoints for CRUD operations on templates
 */

/**
 * Get all templates for the current tenant
 *
 * @param page Page number (1-indexed, default: 1)
 * @param limit Items per page (default: 10, max: 100)
 * @returns List of templates for the tenant
 * @throws Error if fetch fails
 */
export async function getTemplates(
  tenantId: string,
  page: number = 1,
  limit: number = 10,
  search?: string,
): Promise<PaginatedTemplateResponse> {
  try {
    const params = generateApiParameters('/api/v1/frontend/templates', {
      tenantId,
      page: String(page),
      limit: String(limit),
      ...(search ? { search } : {}),
    })
    return await get<PaginatedTemplateResponse>(params)
  } catch (error) {
    const axiosError = error as AxiosError
    const responseData = (axiosError.response?.data as any) || {}

    if (axiosError.response?.status === STATUS_CODES.Unauthorized) {
      throw new Error('You are not authorized to view templates')
    }
    if (axiosError.response?.status === STATUS_CODES.Forbidden) {
      throw new Error('You do not have permission to view templates')
    }

    throw new Error(
      `Failed to fetch templates: ${
        responseData.message || (error instanceof Error ? error.message : 'Unknown error')
      }`,
    )
  }
}

/**
 * Get a specific template by ID
 *
 * @param templateId Template ID
 * @returns Template details
 * @throws Error if template not found or fetch fails
 */
export async function getTemplateById(templateId: string) {
  try {
    const params = generateApiParameters(`/api/v1/frontend/templates/${templateId}`)
    return await get<TemplateResponse>(params)
  } catch (error) {
    const axiosError = error as AxiosError

    if (axiosError.response?.status === STATUS_CODES.NotFound) {
      throw new Error('Template not found')
    }
    if (axiosError.response?.status === STATUS_CODES.Unauthorized) {
      throw new Error('You are not authorized to view this template')
    }

    throw new Error(
      `Failed to fetch template: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
}

export interface PreviewTemplateResponse {
  templateId: string
  channelCode: NotificationChannel
  subject?: string
  body: string
  bodyType: 'text' | 'markdown' | 'html'
}

/**
 * Preview a template with optional sample data
 *
 * @param templateId Template ID
 * @param params Optional key-value pairs for template rendering
 * @returns Rendered template output
 * @throws Error if preview fails
 */
export async function previewTemplate(
  templateId: string,
  params?: Record<string, string>,
): Promise<PreviewTemplateResponse> {
  try {
    const apiParams = generateApiParameters(`/api/v1/frontend/templates/${templateId}/preview`)
    return await post<PreviewTemplateResponse>({ ...apiParams, data: { params } })
  } catch (error) {
    const axiosError = error as AxiosError

    if (axiosError.response?.status === STATUS_CODES.NotFound) {
      throw new Error('Template not found')
    }
    if (axiosError.response?.status === STATUS_CODES.Unauthorized) {
      throw new Error('You are not authorized to preview this template')
    }

    throw new Error(
      `Failed to preview template: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
}

export interface CreateTemplateData {
  name: string
  channelCode: NotificationChannel
  engineCode: TemplateEngine
  subject?: string
  body: string
  bodyType?: TemplateBodyType
}

/**
 * Create a new template
 *
 * @param data Template creation data
 * @returns Created template details
 * @throws Error if creation fails
 */
export async function createTemplate(data: CreateTemplateData): Promise<TemplateResponse> {
  try {
    const params = generateApiParameters('/api/v1/frontend/templates')
    return await post<TemplateResponse>({ ...params, data })
  } catch (error) {
    const axiosError = error as AxiosError
    const responseData = (axiosError.response?.data as any) || {}

    if (axiosError.response?.status === STATUS_CODES.Conflict) {
      throw Object.assign(new Error('A template with this name already exists'), {
        status: STATUS_CODES.Conflict,
      })
    }
    if (axiosError.response?.status === STATUS_CODES.Unauthorized) {
      throw new Error('You are not authorized to create templates')
    }
    if (axiosError.response?.status === STATUS_CODES.Forbidden) {
      throw new Error('You do not have permission to create templates')
    }

    throw new Error(
      `Failed to create template: ${
        responseData.message || (error instanceof Error ? error.message : 'Unknown error')
      }`,
    )
  }
}

/**
 * Update a template
 *
 * @param templateId Template ID
 * @param updateData Template update data
 * @returns Updated template details
 * @throws Error if update fails
 */
export async function updateTemplate(templateId: string, updateData: Partial<TemplateResponse>) {
  try {
    const params = generateApiParameters(`/api/v1/frontend/templates/${templateId}`)
    return await post<TemplateResponse>({ ...params, data: updateData })
  } catch (error) {
    const axiosError = error as AxiosError
    const responseData = (axiosError.response?.data as any) || {}

    if (axiosError.response?.status === STATUS_CODES.NotFound) {
      throw new Error('Template not found')
    }
    if (axiosError.response?.status === STATUS_CODES.Conflict) {
      throw Object.assign(new Error('A template with this name already exists'), {
        status: STATUS_CODES.Conflict,
      })
    }
    if (axiosError.response?.status === STATUS_CODES.Unauthorized) {
      throw new Error('You are not authorized to update this template')
    }
    if (axiosError.response?.status === STATUS_CODES.Forbidden) {
      throw new Error('You do not have permission to update this template')
    }

    throw new Error(
      `Failed to update template: ${
        responseData.message || (error instanceof Error ? error.message : 'Unknown error')
      }`,
    )
  }
}
