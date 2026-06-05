import { ExecutionContext } from '@nestjs/common'

/**
 * Helper to create a properly mocked ExecutionContext for guard tests
 * Includes all methods required by Passport AuthGuard and NestJS guards
 */
export function createMockExecutionContext(
  userPayload?: Record<string, any>,
  headers?: Record<string, string>,
  body?: Record<string, any>,
): ExecutionContext {
  const mockRequest = {
    user: userPayload || {},
    headers: headers || {},
    body: body || {},
    get: (headerName: string) => headers?.[headerName.toLowerCase()],
  }

  const mockResponse = {}

  return {
    switchToHttp: () => ({
      getRequest: () => mockRequest,
      getResponse: () => mockResponse,
      getNext: () => ({}),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToRpc: () => ({
      getData: () => ({}),
      getContext: () => ({}),
    }),
    switchToWs: () => ({
      getData: () => ({}),
      getClient: () => ({}),
    }),
    getArgs: () => [],
    getArgByIndex: () => ({}),
  } as unknown as ExecutionContext
}
