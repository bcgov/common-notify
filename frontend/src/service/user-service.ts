import _kc from '../keycloak'

export const AUTH_TOKEN = '__auth_token'

/**
 * Initializes Keycloak instance and calls the provided callback function if successfully authenticated.
 *
 * @param onAuthenticatedCallback
 */
const initKeycloak = (onAuthenticatedCallback: () => void) => {
  _kc
    .init({
      onLoad: 'login-required',
      pkceMethod: 'S256',
      checkLoginIframe: false,
    })
    .then((authenticated: boolean) => {
      if (authenticated) {
        localStorage.setItem(AUTH_TOKEN, `${_kc.token}`)
        onAuthenticatedCallback()
      }
    })
    .catch((err: unknown) => {
      console.error('Keycloak init failed:', err)
    })

  _kc.onTokenExpired = () => {
    _kc.updateToken(5).then((refreshed: boolean) => {
      if (refreshed) {
        localStorage.setItem(AUTH_TOKEN, `${_kc.token}`)
      }
    })
  }
}

const doLogin = _kc.login

const doLogout = _kc.logout

/**
 * Internal helper: Refreshes token if needed and returns the result of a callback.
 * Abstracts the common refresh-and-return pattern used by getToken() and getTokenParsed().
 */
const refreshTokenIfNeeded = async <T>(returnFn: () => T): Promise<T> => {
  try {
    const wasRefreshed = await _kc.updateToken(5)
    if (wasRefreshed) {
      localStorage.setItem(AUTH_TOKEN, `${_kc.token}`)
    }
    return returnFn()
  } catch (err) {
    console.error('Failed to refresh token:', err)
    doLogin()
    throw err
  }
}

/**
 * Returns a valid token, refreshing if necessary.
 * Checks if the current token expires within 5 seconds; if so, refreshes it.
 * If the token is still valid, returns it without making a refresh call.
 * Abstraction: callers don't need to know about refresh logic - just get a valid token.
 * @returns A valid JWT token string
 * @throws If token refresh fails
 */
const getToken = async (): Promise<string> => {
  return refreshTokenIfNeeded(() => _kc.token as string)
}

/**
 * Returns the token synchronously without refresh logic.
 * Only use when you need the token immediately without async/await.
 * For most use cases, use getToken() instead.
 * @returns Current token or undefined
 */
const getTokenSync = () => _kc.token

/**
 * Returns parsed token claims, refreshing if necessary.
 * Checks if the current token expires within 5 seconds; if so, refreshes it.
 * Then returns the parsed claims from the valid token.
 * @returns Parsed JWT claims object
 * @throws If token refresh fails
 */
const getTokenParsed = async () => {
  return refreshTokenIfNeeded(() => _kc.tokenParsed)
}

/**
 * Returns parsed token claims synchronously without refresh logic.
 * Only use when you need the claims immediately without async/await.
 * For most use cases, use getTokenParsed() instead.
 * @returns Parsed JWT claims or undefined
 */
const getTokenParsedSync = () => _kc.tokenParsed

/**
 * Checks if the user is currently logged in with a valid token.
 * Refreshes token if needed before checking.
 * @returns True if user has a valid token, false otherwise
 */
const isLoggedIn = async (): Promise<boolean> => {
  try {
    await getToken()
    return true
  } catch {
    return false
  }
}

/**
 * Checks if the user has a token synchronously without refresh logic.
 * Only use when you need the status immediately without async/await.
 * For most use cases, use isLoggedIn() instead.
 * @returns True if token exists (may be expired), false otherwise
 */
const isLoggedInSync = () => !!_kc.token

const updateToken = (
  successCallback: ((value: boolean) => boolean | PromiseLike<boolean>) | null | undefined,
) => _kc.updateToken(5).then(successCallback).catch(doLogin)

/**
 * Returns the authenticated user's display name.
 * Refreshes token if needed before reading the name.
 * @returns User's display name or undefined
 */
const getUsername = async () => {
  const parsed = await getTokenParsed()
  return parsed?.display_name
}

/**
 * Determines if a user's role(s) overlap with the role on the private route.  The user's role is determined via jwt.client_roles
 * @param roles
 * @returns True or false, inidicating if the user has the role or not.
 */
const hasRole = (roles: any) => {
  const jwt = _kc.tokenParsed
  const userroles = jwt?.client_roles
  const includesRoles =
    typeof roles === 'string'
      ? userroles?.includes(roles)
      : roles.some((r: any) => userroles?.includes(r))
  return includesRoles
}

const UserService = {
  initKeycloak,
  doLogin,
  doLogout,
  isLoggedIn,
  isLoggedInSync,
  getToken,
  getTokenSync,
  getTokenParsed,
  getTokenParsedSync,
  updateToken,
  getUsername,
  hasRole,
}

export default UserService
