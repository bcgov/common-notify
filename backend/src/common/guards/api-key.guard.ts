import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { Request } from 'express'

/**
 * API Key Guard
 *
 * Validates that an API key is provided in the Authorization header using ApiKey-v1 scheme.
 * Expected format: Authorization: ApiKey-v1 {api-key}
 *
 * Does not validate the key value itself - that responsibility is delegated
 * to the downstream service (e.g., GC Notify API).
 *
 * Used for passthrough endpoints that forward requests to external APIs.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>()
    const authHeader = request.headers['authorization']

    if (!authHeader || typeof authHeader !== 'string') {
      throw new UnauthorizedException(
        'API key is required. Provide Authorization header with format: ApiKey-v1 {api-key}',
      )
    }

    if (!authHeader.startsWith('ApiKey-v1 ')) {
      throw new UnauthorizedException(
        'Invalid authorization scheme. Expected: Authorization: ApiKey-v1 {api-key}',
      )
    }

    const apiKey = authHeader.substring('ApiKey-v1 '.length).trim()
    if (!apiKey) {
      throw new UnauthorizedException('API key cannot be empty')
    }

    return true
  }
}
