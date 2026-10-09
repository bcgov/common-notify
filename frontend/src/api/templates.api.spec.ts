import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  NotificationChannel,
  TemplateEngine,
  createTemplate,
  deleteTemplate,
  getTemplateById,
  getTemplateUsage,
  getTemplates,
  previewTemplate,
  previewTemplateBody,
  updateTemplate,
} from './templates.api'
import { deleteMethod, generateApiParameters, get, post } from '@/common/api'

vi.mock('@/common/api', () => ({
  get: vi.fn(),
  post: vi.fn(),
  deleteMethod: vi.fn(),
  generateApiParameters: vi.fn((url: string, params?: unknown) => ({
    url,
    params,
    requiresAuthentication: true,
  })),
  STATUS_CODES: {
    BadRequest: 400,
    Unauthorized: 401,
    Forbidden: 403,
    NotFound: 404,
    Conflict: 409,
  },
}))

const BASE_URL = '/api/v1/frontend/templates'

/** An axios-shaped rejection, which is what the api layer branches on. */
const httpError = (status: number, data?: unknown) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data },
  })

describe('templates.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getTemplates', () => {
    it('defaults to the first page of ten', async () => {
      vi.mocked(get).mockResolvedValue({ items: [], total: 0 })

      await getTemplates()

      expect(get).toHaveBeenCalledWith(
        expect.objectContaining({ url: `${BASE_URL}?page=1&limit=10` }),
      )
    })

    it('passes paging, search and sort through as query parameters', async () => {
      vi.mocked(get).mockResolvedValue({ items: [], total: 0 })

      await getTemplates(3, 25, 'welcome', '-updatedAt')

      const { url } = vi.mocked(get).mock.calls[0][0] as { url: string }
      expect(url).toContain('page=3')
      expect(url).toContain('limit=25')
      expect(url).toContain('search=welcome')
      expect(url).toContain('sort=-updatedAt')
    })

    it('repeats the filter parameter once per filter', async () => {
      vi.mocked(get).mockResolvedValue({ items: [], total: 0 })

      await getTemplates(1, 10, undefined, undefined, ['channelCode:in:EMAIL', 'active:eq:true'])

      const { url } = vi.mocked(get).mock.calls[0][0] as { url: string }
      expect(url).toContain('filter=channelCode%3Ain%3AEMAIL')
      expect(url).toContain('filter=active%3Aeq%3Atrue')
    })

    it('omits search, sort and filter when they are not supplied', async () => {
      vi.mocked(get).mockResolvedValue({ items: [], total: 0 })

      await getTemplates(1, 10, '', undefined, [])

      const { url } = vi.mocked(get).mock.calls[0][0] as { url: string }
      expect(url).not.toContain('search=')
      expect(url).not.toContain('sort=')
      expect(url).not.toContain('filter=')
    })

    it.each([
      [401, 'You are not authorized to view templates'],
      [403, 'You do not have permission to view templates'],
    ])('explains a %i', async (status, message) => {
      vi.mocked(get).mockRejectedValue(httpError(status))

      await expect(getTemplates()).rejects.toThrow(message)
    })

    it("surfaces the server's message for any other failure", async () => {
      vi.mocked(get).mockRejectedValue(httpError(500, { message: 'database is down' }))

      await expect(getTemplates()).rejects.toThrow('Failed to fetch templates: database is down')
    })
  })

  describe('getTemplateById', () => {
    it('reads one template by id', async () => {
      vi.mocked(get).mockResolvedValue({ id: 't1' })

      await expect(getTemplateById('t1')).resolves.toEqual({ id: 't1' })
      expect(get).toHaveBeenCalledWith(expect.objectContaining({ url: `${BASE_URL}/t1` }))
    })

    it.each([
      [404, 'Template not found'],
      [401, 'You are not authorized to view this template'],
    ])('explains a %i', async (status, message) => {
      vi.mocked(get).mockRejectedValue(httpError(status))

      await expect(getTemplateById('t1')).rejects.toThrow(message)
    })
  })

  describe('previewTemplate', () => {
    it('posts sample values and skips the app-wide spinner', async () => {
      vi.mocked(post).mockResolvedValue({ body: 'Hi Jane' })

      await previewTemplate('t1', { firstName: 'Jane' })

      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({
          url: `${BASE_URL}/t1/preview`,
          skipGlobalLoading: true,
          data: { params: { firstName: 'Jane' } },
        }),
      )
    })

    it.each([
      [404, 'Template not found'],
      [401, 'You are not authorized to preview this template'],
    ])('explains a %i', async (status, message) => {
      vi.mocked(post).mockRejectedValue(httpError(status))

      await expect(previewTemplate('t1')).rejects.toThrow(message)
    })
  })

  describe('previewTemplateBody', () => {
    const body = {
      body: 'Hello {{name}}',
      channelCode: NotificationChannel.EMAIL,
      engineCode: TemplateEngine.HANDLEBARS,
    }

    it('previews unsaved content on the suffix-less preview route', async () => {
      vi.mocked(post).mockResolvedValue({ body: 'Hello Jane' })

      await previewTemplateBody(body)

      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({ url: `${BASE_URL}/preview`, data: body }),
      )
    })

    it('explains a 401', async () => {
      vi.mocked(post).mockRejectedValue(httpError(401))

      await expect(previewTemplateBody(body)).rejects.toThrow(
        'You are not authorized to preview templates',
      )
    })

    it("surfaces the server's message for a render failure", async () => {
      vi.mocked(post).mockRejectedValue(httpError(400, { message: 'unclosed tag' }))

      await expect(previewTemplateBody(body)).rejects.toThrow(
        'Failed to preview template: unclosed tag',
      )
    })
  })

  describe('createTemplate', () => {
    const data = {
      name: 'Welcome',
      channelCode: NotificationChannel.EMAIL,
      engineCode: TemplateEngine.HANDLEBARS,
      body: 'Hi',
    }

    it('posts the new template', async () => {
      vi.mocked(post).mockResolvedValue({ id: 't1' })

      await createTemplate(data)

      expect(post).toHaveBeenCalledWith(expect.objectContaining({ url: BASE_URL, data }))
    })

    it('marks a duplicate name with its status so the form can single it out', async () => {
      vi.mocked(post).mockRejectedValue(httpError(409))

      await expect(createTemplate(data)).rejects.toMatchObject({
        message: 'A template with this name already exists',
        status: 409,
      })
    })

    it.each([
      [401, 'You are not authorized to create templates'],
      [403, 'You do not have permission to create templates'],
    ])('explains a %i', async (status, message) => {
      vi.mocked(post).mockRejectedValue(httpError(status))

      await expect(createTemplate(data)).rejects.toThrow(message)
    })
  })

  describe('updateTemplate', () => {
    it('posts the changed fields to the template route', async () => {
      vi.mocked(post).mockResolvedValue({ id: 't1', name: 'Renamed' })

      await updateTemplate('t1', { name: 'Renamed' })

      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({ url: `${BASE_URL}/t1`, data: { name: 'Renamed' } }),
      )
    })

    it('marks a duplicate name with its status', async () => {
      vi.mocked(post).mockRejectedValue(httpError(409))

      await expect(updateTemplate('t1', { name: 'Taken' })).rejects.toMatchObject({ status: 409 })
    })

    it.each([
      [404, 'Template not found'],
      [401, 'You are not authorized to update this template'],
      [403, 'You do not have permission to update this template'],
    ])('explains a %i', async (status, message) => {
      vi.mocked(post).mockRejectedValue(httpError(status))

      await expect(updateTemplate('t1', {})).rejects.toThrow(message)
    })
  })

  describe('getTemplateUsage', () => {
    it('asks which events use the template', async () => {
      vi.mocked(get).mockResolvedValue({ events: [] })

      await expect(getTemplateUsage('t1')).resolves.toEqual({ events: [] })
      expect(get).toHaveBeenCalledWith(expect.objectContaining({ url: `${BASE_URL}/t1/usage` }))
    })

    it('explains a 404', async () => {
      vi.mocked(get).mockRejectedValue(httpError(404))

      await expect(getTemplateUsage('t1')).rejects.toThrow('Template not found')
    })

    it('explains any other failure', async () => {
      vi.mocked(get).mockRejectedValue(new Error('network down'))

      await expect(getTemplateUsage('t1')).rejects.toThrow(
        'Failed to check where this template is used: network down',
      )
    })
  })

  describe('deleteTemplate', () => {
    it('deletes by id', async () => {
      vi.mocked(deleteMethod).mockResolvedValue(undefined)

      await deleteTemplate('t1')

      expect(deleteMethod).toHaveBeenCalledWith(expect.objectContaining({ url: `${BASE_URL}/t1` }))
    })

    it.each([
      [404, 'Template not found'],
      [401, 'You are not authorized to delete this template'],
      [403, 'You do not have permission to delete this template'],
      [409, 'This template is in use by an event and cannot be deleted'],
    ])('explains a %i', async (status, message) => {
      vi.mocked(deleteMethod).mockRejectedValue(httpError(status))

      await expect(deleteTemplate('t1')).rejects.toThrow(message)
    })
  })

  it('builds every route from the frontend templates base', () => {
    expect(vi.mocked(generateApiParameters)).toBeDefined()
  })
})
