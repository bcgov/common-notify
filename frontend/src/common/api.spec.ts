import { beforeEach, describe, it, expect, vi } from 'vitest'
import axios from 'axios'
import * as api from './api'
import UserService from '@/service/user-service'
import { showErrorToast } from '@/redux/utils/toastUtils'
import { trackRequestStart, trackRequestEnd } from '@/redux/utils/globalLoading'

const interceptors = vi.hoisted(() => ({ request: vi.fn(), response: vi.fn() }))
vi.mock('axios', () => ({
  default: {
    defaults: { headers: { common: {} } },
    interceptors: {
      request: { use: interceptors.request },
      response: { use: interceptors.response },
    },
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))
vi.mock('@/service/user-service', () => ({
  default: { getToken: vi.fn().mockResolvedValue('token') },
}))
vi.mock('@/redux/utils/toastUtils', () => ({ showErrorToast: vi.fn() }))
vi.mock('@/redux/utils/globalLoading', () => ({
  trackRequestStart: vi.fn(),
  trackRequestEnd: vi.fn(),
}))

describe('API helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    window.history.replaceState({}, '', '/')
    for (const method of [axios.get, axios.post, axios.patch, axios.put, axios.delete]) {
      vi.mocked(method).mockResolvedValue({ status: 200, data: { ok: true } })
    }
  })
  it('builds default parameters and optional flags', () => {
    expect(api.generateApiParameters('/test')).toEqual({
      url: '/test',
      requiresAuthentication: true,
      enableNotification: false,
    })
    expect(api.generateApiParameters('/test', { page: 2 }, true, false)).toEqual({
      url: '/test',
      params: { page: 2 },
      requiresAuthentication: false,
      enableNotification: true,
    })
  })
  it.each(['get', 'deleteMethod', 'post', 'patch', 'put'] as const)(
    'authenticates %s and returns response data',
    async (method) => {
      const result = await api[method](api.generateApiParameters('/test', { value: 1 }))
      expect(result).toEqual({ ok: true })
      expect(UserService.getToken).toHaveBeenCalled()
      expect(axios.defaults.headers.common.Authorization).toBe('Bearer token')
    },
  )
  it('passes headers, query parameters and background flags', async () => {
    const parameters = {
      ...api.generateApiParameters('/test', { page: 2 }, false, false),
      skipGlobalLoading: true,
    }
    await api.get(parameters, { custom: 'header' })
    expect(axios.get).toHaveBeenCalledWith('/test', {
      headers: { custom: 'header' },
      params: { page: 2 },
      skipGlobalLoading: true,
    })
    await api.deleteMethod(parameters)
    expect(axios.delete).toHaveBeenCalledWith(
      '/test',
      expect.objectContaining({ params: { page: 2 }, skipGlobalLoading: true }),
    )
    expect(UserService.getToken).not.toHaveBeenCalled()
  })
  it('prefers explicit post data and uploads files', async () => {
    await api.post({
      url: '/test',
      params: { old: true },
      data: { fresh: true },
    } as api.ApiRequestParameters<object> & { data: object })
    expect(axios.post).toHaveBeenCalledWith('/test', { fresh: true }, { headers: undefined })
    const file = new File(['test'], 'test.txt')
    await expect(
      api.putFile(api.generateApiParameters('/upload'), { content: 'file' }, file),
    ).resolves.toEqual({ ok: true })
    expect(axios.put).toHaveBeenCalledWith('/upload', file, { headers: { content: 'file' } })
  })
  it('rejects missing responses and network failures', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce(undefined)
    await expect(api.get({ url: '/' })).rejects.toThrow('No response')
    vi.mocked(axios.get).mockRejectedValueOnce(new Error('Network failure'))
    await expect(api.get({ url: '/' })).rejects.toThrow('Network failure')
  })
  it.each([
    ['get', 'get'],
    ['deleteMethod', 'delete'],
    ['patch', 'patch'],
    ['put', 'put'],
  ] as const)('returns unauthorized response bodies for %s', async (helper, method) => {
    vi.mocked(axios[method]).mockResolvedValueOnce({ status: 401, data: { unauthorized: true } })
    await expect(api[helper]({ url: '/' })).resolves.toEqual({ unauthorized: true })
  })
  it('returns unauthorized file upload response bodies', async () => {
    vi.mocked(axios.put).mockResolvedValueOnce({ status: 401, data: { unauthorized: true } })
    await expect(api.putFile({ url: '/' }, {}, new File([], 'test'))).resolves.toEqual({
      unauthorized: true,
    })
  })
})

// Capture the handlers registered when the module is imported, before mocks are cleared.
const [request, requestFailure] = interceptors.request.mock.calls[0]
const [response, responseFailure] = interceptors.response.mock.calls[0]
describe('API interceptors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    window.history.replaceState({}, '', '/')
  })
  it('injects tenant context, preserves overrides and tracks foreground requests', () => {
    localStorage.setItem('notify_selected_tenant', JSON.stringify({ id: 'tenant' }))
    expect(request({ headers: {} }).headers['X-Tenant-ID']).toBe('tenant')
    expect(
      request({ headers: { 'X-Tenant-ID': 'override' }, skipGlobalLoading: true }).headers[
        'X-Tenant-ID'
      ],
    ).toBe('override')
    expect(trackRequestStart).toHaveBeenCalledTimes(1)
  })
  it.each([null, '{invalid', '{}'])(
    'tolerates missing or malformed tenant context: %s',
    (stored) => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      if (stored) localStorage.setItem('notify_selected_tenant', stored)
      expect(request({ headers: {} }).headers).toEqual({})
      vi.restoreAllMocks()
    },
  )
  it('balances loading only for foreground responses', () => {
    const foreground = { config: {} }
    expect(response(foreground)).toBe(foreground)
    response({ config: { skipGlobalLoading: true } })
    expect(trackRequestEnd).toHaveBeenCalledTimes(1)
  })
  it.each([
    [401, '/admin/tenants', 'Tenant missing', false],
    [401, '/usage', 'Tenant missing', true],
    [401, '/usage', 'tenant missing', true],
    [401, '/usage', 'Token expired', false],
    [403, '/usage', '', true],
    [500, '/usage', '', false],
  ])('handles status %s for %s (%s)', async (status, url, message, toast) => {
    const error = { config: { url }, response: { status, data: { message } } }
    await expect(responseFailure(error)).rejects.toBe(error)
    expect(showErrorToast).toHaveBeenCalledTimes(toast ? 1 : 0)
    expect(trackRequestEnd).toHaveBeenCalledTimes(1)
  })
  it('suppresses permission toasts on the authorization page and skips background loading', async () => {
    window.history.replaceState({}, '', '/not-authorized')
    for (const status of [401, 403]) {
      await expect(
        responseFailure({
          config: { skipGlobalLoading: true },
          response: { status, data: { message: 'Tenant missing' } },
        }),
      ).rejects.toBeDefined()
    }
    expect(showErrorToast).not.toHaveBeenCalled()
    expect(trackRequestEnd).not.toHaveBeenCalled()
    await expect(requestFailure(new Error('request failed'))).rejects.toThrow('request failed')
  })
})
