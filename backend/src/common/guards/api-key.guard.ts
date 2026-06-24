import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { Request } from 'express'

/**
 * Format-only API key guard for GC Notify passthrough routes. Validates that
 * the Authorization header is present and uses the `ApiKey-v1 {key}` scheme,
 * then attaches the raw header as `request.gcNotifyAuthHeader` so the controller
 * can forward it unmodified to the real GC Notify API. No DB lookups or tenant
 * resolution — Kong's key-auth plugin handles key validity upstream.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { gcNotifyAuthHeader?: string }>()
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

    request.gcNotifyAuthHeader = authHeader.trim()

    return true
  }
}
