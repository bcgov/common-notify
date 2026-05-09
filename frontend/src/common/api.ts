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

/**
 * Gets the auth token and returns it without modifying global state
 * This is safer for concurrent requests as it avoids shared state modifications
 */
const getAuthToken = async (): Promise<string> => {
  return UserService.getToken()
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
  const requestConfig: AxiosRequestConfig = { headers: headers || {} }
  
  // Get auth token and pass it directly in request config to avoid global state modifications
  // This is crucial for parallel requests - each request gets its own token without race conditions
  if (requiresAuthentication) {
    const token = await getAuthToken()
    requestConfig.headers = {
      ...requestConfig.headers,
      'Authorization': `Bearer ${token}`
    }
  }
  
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
  const requestConfig: AxiosRequestConfig = { headers: headers || {} }
  
  // Get auth token and pass it directly in request config to avoid global state modifications
  if (requiresAuthentication) {
    const token = await getAuthToken()
    requestConfig.headers = {
      ...requestConfig.headers,
      'Authorization': `Bearer ${token}`
    }
  }
  
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
  // Use 'data' if provided (for POST body), otherwise use 'params' (legacy)
  const bodyData = data || params
  
  const requestConfig: AxiosRequestConfig = {}
  // Get auth token and pass it directly in request config to avoid global state modifications
  if (requiresAuthentication) {
    const token = await getAuthToken()
    requestConfig.headers = {
      'Authorization': `Bearer ${token}`
    }
  }
  
  return axios.post(url, bodyData, requestConfig).then((response: AxiosResponse) => response.data as T)
}

export const patch = async <T, M = object>(
  parameters: ApiRequestParameters<M>,
  headers: object = {},
): Promise<T> => {
  const { url, requiresAuthentication, params: data } = parameters
  const requestConfig: AxiosRequestConfig = { headers: { ...headers } }
  
  // Get auth token and pass it directly in request config to avoid global state modifications
  if (requiresAuthentication) {
    const token = await getAuthToken()
    requestConfig.headers = {
      ...requestConfig.headers,
      'Authorization': `Bearer ${token}`
    }
  }
  
  return axios.patch(url, data, requestConfig).then((response: AxiosResponse) => {
    if (response.status === STATUS_CODES.Unauthorized) window.location.href = KEYCLOAK_URL
    return response.data as T
  })
}

export const put = async <T, M = object>(
  parameters: ApiRequestParameters<M>,
  headers: object = {},
): Promise<T> => {
  const { url, requiresAuthentication, params: data } = parameters
  const requestConfig: AxiosRequestConfig = { headers: { ...headers } }
  
  // Get auth token and pass it directly in request config to avoid global state modifications
  if (requiresAuthentication) {
    const token = await getAuthToken()
    requestConfig.headers = {
      ...requestConfig.headers,
      'Authorization': `Bearer ${token}`
    }
  }
  
  return axios.put(url, data, requestConfig).then((response: AxiosResponse) => {
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
  const requestConfig: AxiosRequestConfig = { headers: { ...headers } }
  
  // Get auth token and pass it directly in request config to avoid global state modifications
  if (requiresAuthentication) {
    const token = await getAuthToken()
    requestConfig.headers = {
      ...requestConfig.headers,
      'Authorization': `Bearer ${token}`
    }
  }
  
  return axios.put(url, file, requestConfig).then((response: AxiosResponse) => {
    if (response.status === STATUS_CODES.Unauthorized) window.location.href = KEYCLOAK_URL
    return response.data as T
  })
}
