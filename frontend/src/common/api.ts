import type { AxiosResponse, AxiosError, AxiosRequestConfig } from 'axios'
import axios from 'axios'
import config from '@/config'
import UserService from '@/service/user-service'

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

// Response interceptor to handle auth errors
axios.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const { response } = error
    if (response && response.status === STATUS_CODES.Unauthorized) {
      // 401 = unauthenticated: redirect to Keycloak login
      UserService.doLogin()
    } else if (response && response.status === STATUS_CODES.Forbidden) {
      // 403 = authenticated but lacks permission
      globalThis.location.href = '/not-authorized'
    }
    return Promise.reject(error)
  },
)

const setAuthHeader = () => {
  axios.defaults.headers.common['Authorization'] = `Bearer ${UserService.getToken()}`
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

export const get = <T, M = object>(
  parameters: ApiRequestParameters<M>,
  headers?: object,
): Promise<T> => {
  const { url, requiresAuthentication, params } = parameters
  const requestConfig: AxiosRequestConfig = { headers }
  if (requiresAuthentication) setAuthHeader()
  if (params) requestConfig.params = params
  return axios.get(url, requestConfig).then((response: AxiosResponse) => {
    if (!response) throw new Error('No response')
    if (response.status === STATUS_CODES.Unauthorized) window.location.href = KEYCLOAK_URL
    return response.data as T
  })
}

// named deleteMethod because 'delete' is a reserved word in JavaScript
export const deleteMethod = <T, M = object>(
  parameters: ApiRequestParameters<M>,
  headers?: object,
): Promise<T> => {
  const { url, requiresAuthentication, params } = parameters
  const requestConfig: AxiosRequestConfig = { headers }
  if (requiresAuthentication) setAuthHeader()
  if (params) requestConfig.params = params
  return axios.delete(url, requestConfig).then((response: AxiosResponse) => {
    if (response.status === STATUS_CODES.Unauthorized) window.location.href = KEYCLOAK_URL
    return response.data as T
  })
}

export const post = <T, M = object>(parameters: ApiRequestParameters<M>): Promise<T> => {
  const { url, requiresAuthentication, params } = parameters
  if (requiresAuthentication) setAuthHeader()
  return axios.post(url, params).then((response: AxiosResponse) => response.data as T)
}

export const patch = <T, M = object>(
  parameters: ApiRequestParameters<M>,
  headers: object = {},
): Promise<T> => {
  const { url, requiresAuthentication, params: data } = parameters
  if (requiresAuthentication) setAuthHeader()
  return axios.patch(url, data, { headers }).then((response: AxiosResponse) => {
    if (response.status === STATUS_CODES.Unauthorized) window.location.href = KEYCLOAK_URL
    return response.data as T
  })
}

export const put = <T, M = object>(
  parameters: ApiRequestParameters<M>,
  headers: object = {},
): Promise<T> => {
  const { url, requiresAuthentication, params: data } = parameters
  if (requiresAuthentication) setAuthHeader()
  return axios.put(url, data, { headers }).then((response: AxiosResponse) => {
    if (response.status === STATUS_CODES.Unauthorized) window.location.href = KEYCLOAK_URL
    return response.data as T
  })
}

export const putFile = <T>(
  parameters: ApiRequestParameters,
  headers: object,
  file: File,
): Promise<T> => {
  const { url, requiresAuthentication } = parameters
  if (requiresAuthentication) setAuthHeader()
  return axios.put(url, file, { headers }).then((response: AxiosResponse) => {
    if (response.status === STATUS_CODES.Unauthorized) window.location.href = KEYCLOAK_URL
    return response.data as T
  })
}
