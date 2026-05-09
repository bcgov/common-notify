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

// Configure axios with timeout and retry settings
// These are critical for OpenShift stability where network conditions are less predictable
axios.defaults.timeout = 30000 // 30 second timeout for all requests
axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest'

// Track retry attempts to log them
interface RetryConfig extends AxiosRequestConfig {
  __retryCount?: number
  __maxRetries?: number
}

// Flag to prevent duplicate interceptor registration
let responseInterceptorRegistered = false
let requestInterceptorRegistered = false

// Request interceptor to add X-Tenant-ID header from selected tenant
if (!requestInterceptorRegistered) {
  axios.interceptors.request.use((config: RetryConfig) => {
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

    // Initialize retry counter
    if (!config.__retryCount) {
      config.__retryCount = 0
    }
    config.__maxRetries = 2 // Retry up to 2 times on failure

    return config
  })
  requestInterceptorRegistered = true
}

// Response interceptor to handle auth errors and implement retry logic
if (!responseInterceptorRegistered) {
  axios.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const config = error.config as RetryConfig

      // Log the error for debugging
      console.error('[API] Request failed:', {
        url: config?.url,
        status: error.response?.status,
        message: error.message,
        code: error.code,
        retryCount: config?.__retryCount,
      })

      // Check if this is a network error or timeout that can be retried
      const isRetryableError =
        !error.response || // Network error
        error.code === 'ECONNABORTED' || // Timeout
        error.code === 'ERR_NETWORK' || // Network error
        error.response?.status === STATUS_CODES.ServiceUnavailable || // 503
        error.response?.status === STATUS_CODES.BadGateway // 502

      // Retry logic: exponential backoff
      if (
        isRetryableError &&
        config &&
        (config.__retryCount ?? 0) < (config.__maxRetries ?? 0)
      ) {
        config.__retryCount = (config.__retryCount ?? 0) + 1
        const delayMs = Math.pow(2, config.__retryCount) * 1000 // Exponential backoff: 2s, 4s, etc.

        console.warn(
          `[API] Retrying request to ${config.url} (attempt ${config.__retryCount}/${config.__maxRetries}) after ${delayMs}ms`,
        )

        await new Promise((resolve) => setTimeout(resolve, delayMs))
        return axios(config) // Retry the request
      }

      const { response } = error
      if (response && response.status === STATUS_CODES.Unauthorized) {
        // 401 = unauthorized
        // This could be either:
        // 1. Expired token - redirect to Keycloak to refresh
        // 2. Missing tenant context - show error to user

        const responseData = (response.data as any) || {}
        const errorMessage = responseData.message || ''

        // If error message mentions tenant, don't redirect - show error instead
        if (errorMessage.includes('tenant') || errorMessage.includes('Tenant')) {
          showErrorToast(`Authorization failed: ${errorMessage}`)
          return Promise.reject(error)
        }

        // Otherwise, assume token expired and redirect to Keycloak
        UserService.doLogin()
      } else if (response && response.status === STATUS_CODES.Forbidden) {
        // 403 = authenticated but lacks permission: show toast instead of redirecting
        showErrorToast('You do not have permission to access this resource')
      } else if (isRetryableError) {
        // Network/timeout error that couldn't be retried further
        const errorMsg = error.code === 'ECONNABORTED' ? 'Request timeout' : 'Network connection failed'
        showErrorToast(
          `${errorMsg}. If this persists, please refresh the page or check your internet connection.`,
        )
      }
      return Promise.reject(error)
    },
  )
  responseInterceptorRegistered = true
}

const setAuthHeader = async () => {
  const token = await UserService.getToken()
  axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
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
