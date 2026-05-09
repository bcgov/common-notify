import type { AxiosError } from 'axios'
import { get, generateApiParameters, STATUS_CODES } from '@/common/api'

export enum NotificationChannel {
  EMAIL = 'email',
  SMS = 'sms',
  PUSH = 'push',
}

export enum TemplateEngine {
  HANDLEBARS = 'handlebars',
  MUSTACHE = 'mustache',
}

export interface TemplateResponse {
  id: string
  name: string
  description?: string
  channelCode: NotificationChannel
  subject?: string
  body: string
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
 * @param tenantId CSTAR external tenant ID to filter by
 * @param page Page number (1-indexed, default: 1)
 * @param limit Items per page (default: 10, max: 100)
 * @returns List of templates for the tenant
 * @throws Error if fetch fails
 */
export async function getTemplates(tenantId: string, page: number = 1, limit: number = 10) {
  try {
    const params = generateApiParameters('/api/v1/frontend/templates')
    const queryParams = {
      tenantId,
      page: String(page),
      limit: String(limit),
    }
    return await get<TemplateResponse[]>({ ...params, params: queryParams })
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
