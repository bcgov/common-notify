import type { AxiosResponse, AxiosError, AxiosRequestConfig } from 'axios'
import axios from 'axios'
import config from '@/config'
import UserService from '@/service/user-service'
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

const { KEYCLOAK_URL } = config

// Flag to prevent duplicate interceptor registration
let responseInterceptorRegistered = false
let requestInterceptorRegistered = false

const registerRequestInterceptor = () => {
  if (requestInterceptorRegistered) return

  // Add X-Tenant-ID header to all requests if a tenant is selected
  axios.interceptors.request.use(
    (config) => {
      // Only set X-Tenant-ID from localStorage if not already set in the request
      // This allows specific requests to override the default tenant
      if (!config.headers['X-Tenant-ID']) {
        const selectedTenantJson = localStorage.getItem('notify_selected_tenant')
        if (selectedTenantJson) {
          try {
            const selectedTenant = JSON.parse(selectedTenantJson)
            if (selectedTenant?.id) {
              config.headers['X-Tenant-ID'] = selectedTenant.id
            }
          } catch {
            console.error('[API Interceptor] Failed to parse selected tenant from localStorage')
          }
        } else {
          console.warn('[API Interceptor] No selected tenant in localStorage')
        }
      }
      return config
    },
    (error) => Promise.reject(error),
  )
  requestInterceptorRegistered = true
}

// Response interceptor to handle auth errors (register only once)
if (!responseInterceptorRegistered) {
  registerRequestInterceptor() // Also register request interceptor
  axios.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      const { response, config } = error
      if (response && response.status === STATUS_CODES.Unauthorized) {
        // 401 = unauthorized
        // This could be either:
        // 1. Expired token - redirect to Keycloak to refresh
        // 2. Missing tenant context - show error to user
        // 3. Admin endpoint user lacks permission - fail silently

        const responseData = (response.data as any) || {}
        const errorMessage = responseData.message || ''
        const url = config?.url || ''

        // Don't redirect for admin endpoints, let them fail silently.  We don't care if non-adin users can't list all tenants since they don't need (and shouldn't see) a list of tenants
        if (url.includes('/admin/tenants')) {
          return Promise.reject(error)
        }

        // If error message mentions tenant, show error
        if (errorMessage.includes('tenant') || errorMessage.includes('Tenant')) {
          // But don't show if we're already on the not-authorized page
          if (!window.location.pathname.includes('/not-authorized')) {
            showErrorToast(`Authorization failed: ${errorMessage}`)
          }
          return Promise.reject(error)
        }

        // For other 401 errors, let the error propagate (token refresh is handled elsewhere)
        return Promise.reject(error)
      } else if (response && response.status === STATUS_CODES.Forbidden) {
        // 403 = authenticated but lacks permission: show toast instead of redirecting
        // But don't show if we're already on the not-authorized page
        if (!window.location.pathname.includes('/not-authorized')) {
          showErrorToast('You do not have permission to access this resource')
        }
      }
      return Promise.reject(error)
    },
  )
  responseInterceptorRegistered = true
}

const setAuthHeader = async () => {
  const token = await UserService.getToken()
  axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
  registerRequestInterceptor()
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
  const { url, requiresAuthentication, params } = parameters
  const requestConfig: AxiosRequestConfig = { headers }
  if (requiresAuthentication) await setAuthHeader()
  if (params) requestConfig.params = params
  return axios.get(url, requestConfig).then((response: AxiosResponse) => {
    if (!response) throw new Error('No response')
    if (response.status === STATUS_CODES.Unauthorized) window.location.href = KEYCLOAK_URL
    return response.data as T
  })
}

// named deleteMethod because 'delete' is a reserved word in JavaScript
export const deleteMethod = async <T, M = object>(
  parameters: ApiRequestParameters<M>,
  headers?: object,
): Promise<T> => {
  const { url, requiresAuthentication, params } = parameters
  const requestConfig: AxiosRequestConfig = { headers }
  if (requiresAuthentication) await setAuthHeader()
  if (params) requestConfig.params = params
  return axios.delete(url, requestConfig).then((response: AxiosResponse) => {
    if (response.status === STATUS_CODES.Unauthorized) window.location.href = KEYCLOAK_URL
    return response.data as T
  })
}

export const post = async <T, M = object>(
  parameters: ApiRequestParameters<M> & { data?: M },
): Promise<T> => {
  const { url, requiresAuthentication, params, data } = parameters
  if (requiresAuthentication) await setAuthHeader()
  // Use 'data' if provided (for POST body), otherwise use 'params' (legacy)
  const bodyData = data || params
  return axios.post(url, bodyData).then((response: AxiosResponse) => response.data as T)
}

export const patch = async <T, M = object>(
  parameters: ApiRequestParameters<M>,
  headers: object = {},
): Promise<T> => {
  const { url, requiresAuthentication, params: data } = parameters
  if (requiresAuthentication) await setAuthHeader()
  return axios.patch(url, data, { headers }).then((response: AxiosResponse) => {
    if (response.status === STATUS_CODES.Unauthorized) window.location.href = KEYCLOAK_URL
    return response.data as T
  })
}

export const put = async <T, M = object>(
  parameters: ApiRequestParameters<M>,
  headers: object = {},
): Promise<T> => {
  const { url, requiresAuthentication, params: data } = parameters
  if (requiresAuthentication) await setAuthHeader()
  return axios.put(url, data, { headers }).then((response: AxiosResponse) => {
    if (response.status === STATUS_CODES.Unauthorized) window.location.href = KEYCLOAK_URL
    return response.data as T
  })
}

export const putFile = async <T>(
  parameters: ApiRequestParameters,
  headers: object,
  file: File,
): Promise<T> => {
  const { url, requiresAuthentication } = parameters
  if (requiresAuthentication) await setAuthHeader()
  return axios.put(url, file, { headers }).then((response: AxiosResponse) => {
    if (response.status === STATUS_CODES.Unauthorized) window.location.href = KEYCLOAK_URL
    return response.data as T
  })
}
