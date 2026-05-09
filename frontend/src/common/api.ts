import type { AxiosResponse, AxiosError, AxiosRequestConfig } from 'axios'
import axios from 'axios'
import config from '@/config'
import { showErrorToast } from '@/redux/utils/toastUtils'

export interface ApiRequestParameters<T = object> {
  url: string
  params?: T
  requiresAuthentication?: boolean
  enableNotification?: boolean
}

export const STATUS_CODES = {
  Ok: 200,
  BadRequest: 400,
  Unauthorized: 401,
  Forbidden: 403,
  NotFound: 404,
  MethodNotAllowed: 405,
  InternalServerError: 500,
  BadGateway: 502,
  ServiceUnavailable: 503,
  Conflict: 409,
}

// Flag to prevent duplicate interceptor registration
let responseInterceptorRegistered = false
let requestInterceptorRegistered = false

// Request interceptor to add X-Tenant-ID header from selected tenant
if (!requestInterceptorRegistered) {
  axios.interceptors.request.use((config) => {
    // Get selected tenant from localStorage (where we persist it)
    const selectedTenantJson = localStorage.getItem('notify_selected_tenant')
    if (selectedTenantJson) {
      try {
        const selectedTenant = JSON.parse(selectedTenantJson)
        if (selectedTenant?.id) {
          config.headers['X-Tenant-ID'] = selectedTenant.id
          console.log(
            `[API] Added X-Tenant-ID header: ${selectedTenant.id} for request to ${config.url}`,
          )
        }
      } catch (e) {
        console.error('[API] Failed to parse selected tenant from localStorage:', e)
      }
    } else {
      console.warn('[API] No selected tenant in localStorage for request to:', config.url)
    }
    return config
  })
  requestInterceptorRegistered = true
}

// Response interceptor to handle auth errors (register only once)
if (!responseInterceptorRegistered) {
  axios.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      const { response } = error
      if (response && response.status === STATUS_CODES.Unauthorized) {
        // 401 = unauthorized
        const responseData = (response.data as any) || {}
        const errorMessage = responseData.message || ''

        // If error message mentions tenant, show error to user
        if (errorMessage.includes('tenant') || errorMessage.includes('Tenant')) {
          showErrorToast(`Authorization failed: ${errorMessage}`)
        }
        // Don't redirect automatically - let the app handle token refresh/retry
        // Automatic redirect causes infinite login loops
      } else if (response && response.status === STATUS_CODES.Forbidden) {
        // 403 = authenticated but lacks permission: show toast instead of redirecting
        showErrorToast('You do not have permission to access this resource')
      }
      return Promise.reject(error)
    },
  )
  responseInterceptorRegistered = true
}

export const generateApiParameters = <T = object>(
  url: string,
  params?: T,
  enableNotification: boolean = false,
  requiresAuthentication: boolean = true,
): ApiRequestParameters<T> => {
  const result: ApiRequestParameters<T> = { url, requiresAuthentication, enableNotification }
  if (params) return { ...result, params }
  return result
}

export const get = async <T, M = object>(
  parameters: ApiRequestParameters<M>,
  headers?: object,
): Promise<T> => {
  const { url, params } = parameters
  const requestConfig: AxiosRequestConfig = { headers }
  if (params) requestConfig.params = params
  return axios.get(url, requestConfig).then((response: AxiosResponse) => {
    if (!response) throw new Error('No response')
    return response.data as T
  })
}

// named deleteMethod because 'delete' is a reserved word in JavaScript
export const deleteMethod = async <T, M = object>(
  parameters: ApiRequestParameters<M>,
  headers?: object,
): Promise<T> => {
  const { url, params } = parameters
  const requestConfig: AxiosRequestConfig = { headers }
  if (params) requestConfig.params = params
  return axios.delete(url, requestConfig).then((response: AxiosResponse) => {
    return response.data as T
  })
}

export const post = async <T, M = object>(
  parameters: ApiRequestParameters<M> & { data?: M },
): Promise<T> => {
  const { url, params, data } = parameters
  // Use 'data' if provided (for POST body), otherwise use 'params' (legacy)
  const bodyData = data || params
  return axios.post(url, bodyData).then((response: AxiosResponse) => response.data as T)
}

export const patch = async <T, M = object>(
  parameters: ApiRequestParameters<M>,
  headers: object = {},
): Promise<T> => {
  const { url, params: data } = parameters
  return axios.patch(url, data, { headers }).then((response: AxiosResponse) => {
    return response.data as T
  })
}

export const put = async <T, M = object>(
  parameters: ApiRequestParameters<M>,
  headers: object = {},
): Promise<T> => {
  const { url, params: data } = parameters
  return axios.put(url, data, { headers }).then((response: AxiosResponse) => {
    return response.data as T
  })
}

export const putFile = async <T>(
  parameters: ApiRequestParameters,
  headers: object,
  file: File,
): Promise<T> => {
  const { url } = parameters
  return axios.put(url, file, { headers }).then((response: AxiosResponse) => {
    return response.data as T
  })
}
