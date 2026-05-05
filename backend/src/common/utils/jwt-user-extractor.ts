import { Logger } from '@nestjs/common'
import * as express from 'express'

/**
 * Utility for extracting user information from JWT tokens and Kong headers
 * Centralizes user extraction logic used across controllers
 */
export class JwtUserExtractor {
  private static readonly logger = new Logger(JwtUserExtractor.name)

  /**
   * Extract user identifier from request headers and JWT token
   * Checks Kong headers first (higher priority), then JWT claims
   *
   * Kong headers (added by API Gateway after auth):
   * - x-consumer-username: The authenticated user's username
   *
   * JWT claims (checked in order of preference):
   * 1. preferred_username (Keycloak standard claim)
   * 2. email (alternative identifier)
   * 3. name (fallback)
   * 4. sub (subject claim, usually last resort)
   *
   * @param req Express request object
   * @returns User identifier string, or 'system' if none found
   */
  static extractUser(req?: express.Request): string {
    if (!req) return 'system'

    try {
      // Kong consumer username header
      const kongUsername = req.headers['x-consumer-username']
      if (kongUsername) {
        return kongUsername as string
      }

      // Extract from JWT in Authorization header
      const authHeader = req.headers.authorization
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7)
        const user = this.extractFromToken(token)
        if (user) return user
      }
    } catch (error) {
      this.logger.warn('Failed to extract user from request:', (error as Error).message)
    }

    return 'system'
  }

  /**
   * Extract user identifier from JWT token payload
   * @param token JWT token string
   * @returns User identifier or null if extraction fails
   */
  private static extractFromToken(token: string): string | null {
    try {
      const parts = token.split('.')
      if (parts.length !== 3) {
        this.logger.warn(`Invalid JWT format: expected 3 parts, got ${parts.length}`)
        return null
      }

      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'))

      // Try various claim names in order of preference
      if (payload.preferred_username) return payload.preferred_username
      if (payload.email) return payload.email
      if (payload.name) return payload.name
      if (payload.sub) return payload.sub

      this.logger.warn('No user identifier claims found in JWT token')
      return null
    } catch (error) {
      this.logger.warn(
        `Failed to parse JWT token: ${(error as Error).message}`,
        (error as Error).stack,
      )
      return null
    }
  }
}
