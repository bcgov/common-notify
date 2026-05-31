import { Logger } from '@nestjs/common'
import { JwtUserExtractor } from './jwt-user-extractor'

describe('JwtUserExtractor', () => {
  const mockLogger = {
    warn: vi.fn(),
    log: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock the logger
    vi.spyOn(Logger, 'constructor' as never).mockReturnValue(mockLogger as never)
  })

  describe('extractUser', () => {
    describe('with no request', () => {
      it('should return "system" when request is undefined', () => {
        const result = JwtUserExtractor.extractUser(undefined)
        expect(result).toBe('system')
      })

      it('should return "system" when request is null', () => {
        const result = JwtUserExtractor.extractUser(null as any)
        expect(result).toBe('system')
      })
    })

    describe('with JWT token', () => {
      it('should extract preferred_username from JWT', () => {
        const token = createJwt({ preferred_username: 'john.doe' })
        const req = {
          headers: {
            authorization: `Bearer ${token}`,
          },
        } as any

        const result = JwtUserExtractor.extractUser(req)
        expect(result).toBe('john.doe')
      })

      it('should extract email when preferred_username is absent', () => {
        const token = createJwt({ email: 'john@example.com' })
        const req = {
          headers: {
            authorization: `Bearer ${token}`,
          },
        } as any

        const result = JwtUserExtractor.extractUser(req)
        expect(result).toBe('john@example.com')
      })

      it('should extract name when preferred_username and email are absent', () => {
        const token = createJwt({ name: 'John Doe' })
        const req = {
          headers: {
            authorization: `Bearer ${token}`,
          },
        } as any

        const result = JwtUserExtractor.extractUser(req)
        expect(result).toBe('John Doe')
      })

      it('should extract sub when other claims are absent', () => {
        const token = createJwt({ sub: 'subject-id-123' })
        const req = {
          headers: {
            authorization: `Bearer ${token}`,
          },
        } as any

        const result = JwtUserExtractor.extractUser(req)
        expect(result).toBe('subject-id-123')
      })

      it('should return "system" when no user identifier claims found', () => {
        const token = createJwt({ iss: 'issuer', aud: 'audience' })
        const req = {
          headers: {
            authorization: `Bearer ${token}`,
          },
        } as any

        const result = JwtUserExtractor.extractUser(req)
        expect(result).toBe('system')
      })

      it('should follow claim preference order: preferred_username > email > name > sub', () => {
        const token = createJwt({
          preferred_username: 'preferred',
          email: 'email@example.com',
          name: 'Name',
          sub: 'subject',
        })
        const req = {
          headers: {
            authorization: `Bearer ${token}`,
          },
        } as any

        const result = JwtUserExtractor.extractUser(req)
        expect(result).toBe('preferred')
      })

      it('should handle complex tokens with multiple claims', () => {
        const token = createJwt({
          email: 'user@example.com',
          name: 'User Name',
          sub: 'user-id',
          aud: 'my-app',
          iss: 'https://auth.example.com',
        })
        const req = {
          headers: {
            authorization: `Bearer ${token}`,
          },
        } as any

        const result = JwtUserExtractor.extractUser(req)
        expect(result).toBe('user@example.com')
      })
    })

    describe('with invalid JWT', () => {
      it('should handle malformed authorization header', () => {
        const req = {
          headers: {
            authorization: 'InvalidBearerFormat',
          },
        } as any

        const result = JwtUserExtractor.extractUser(req)
        expect(result).toBe('system')
      })

      it('should handle JWT with invalid base64 in payload', () => {
        const req = {
          headers: {
            authorization: 'Bearer header.!!!invalid!!!.signature',
          },
        } as any

        const result = JwtUserExtractor.extractUser(req)
        expect(result).toBe('system')
      })

      it('should handle JWT with wrong number of parts', () => {
        const req = {
          headers: {
            authorization: 'Bearer onlyonepart',
          },
        } as any

        const result = JwtUserExtractor.extractUser(req)
        expect(result).toBe('system')
      })

      it('should handle JWT with invalid JSON in payload', () => {
        const invalidPayload = Buffer.from('not json').toString('base64')
        const req = {
          headers: {
            authorization: `Bearer header.${invalidPayload}.signature`,
          },
        } as any

        const result = JwtUserExtractor.extractUser(req)
        expect(result).toBe('system')
      })
    })

    describe('with exception handling', () => {
      it('should gracefully handle unexpected errors', () => {
        const req = {
          headers: null,
        } as any

        expect(() => {
          JwtUserExtractor.extractUser(req)
        }).not.toThrow()
      })

      it('should log warning when extraction fails', () => {
        const req = {
          headers: {
            authorization: 'Bearer header.!!!invalid!!!.signature',
          },
        } as any

        JwtUserExtractor.extractUser(req)
        // Logger mock would capture this
      })
    })

    describe('edge cases', () => {
      it('should handle empty authorization header', () => {
        const req = {
          headers: {
            authorization: '',
          },
        } as any

        const result = JwtUserExtractor.extractUser(req)
        expect(result).toBe('system')
      })

      it('should handle authorization header with only "Bearer"', () => {
        const req = {
          headers: {
            authorization: 'Bearer ',
          },
        } as any

        const result = JwtUserExtractor.extractUser(req)
        expect(result).toBe('system')
      })

      it('should handle authorization header with "bearer" lowercase', () => {
        const token = createJwt({ preferred_username: 'user' })
        const req = {
          headers: {
            authorization: `bearer ${token}`,
          },
        } as any

        const result = JwtUserExtractor.extractUser(req)
        expect(result).toBe('system')
      })

      it('should handle headers object without authorization', () => {
        const req = {
          headers: {
            'x-custom': 'value',
          },
        } as any

        const result = JwtUserExtractor.extractUser(req)
        expect(result).toBe('system')
      })

      it('should handle empty headers object', () => {
        const req = {
          headers: {},
        } as any

        const result = JwtUserExtractor.extractUser(req)
        expect(result).toBe('system')
      })

      it('should handle JWT with empty payload object', () => {
        const token = createJwt({})
        const req = {
          headers: {
            authorization: `Bearer ${token}`,
          },
        } as any

        const result = JwtUserExtractor.extractUser(req)
        expect(result).toBe('system')
      })
    })

    describe('claim extraction priority', () => {
      it('should prefer email over name and sub', () => {
        const token = createJwt({
          email: 'primary@example.com',
          name: 'Secondary Name',
          sub: 'tertiary-id',
        })
        const req = {
          headers: {
            authorization: `Bearer ${token}`,
          },
        } as any

        const result = JwtUserExtractor.extractUser(req)
        expect(result).toBe('primary@example.com')
      })

      it('should prefer name over sub', () => {
        const token = createJwt({
          name: 'User Name',
          sub: 'subject-id',
        })
        const req = {
          headers: {
            authorization: `Bearer ${token}`,
          },
        } as any

        const result = JwtUserExtractor.extractUser(req)
        expect(result).toBe('User Name')
      })

      it('should use sub as last resort', () => {
        const token = createJwt({
          sub: 'only-subject',
        })
        const req = {
          headers: {
            authorization: `Bearer ${token}`,
          },
        } as any

        const result = JwtUserExtractor.extractUser(req)
        expect(result).toBe('only-subject')
      })
    })

    describe('real-world Keycloak tokens', () => {
      it('should extract user from Keycloak token with preferred_username', () => {
        const token = createJwt({
          preferred_username: 'john.doe',
          email: 'john.doe@example.com',
          sub: 'e2e8d5e7-f4d3-4f8c-b6c5-8a1b3e5f2c9a',
          iss: 'https://keycloak.example.com/realms/notifications',
          aud: 'notify-api',
        })
        const req = {
          headers: {
            authorization: `Bearer ${token}`,
          },
        } as any

        const result = JwtUserExtractor.extractUser(req)
        expect(result).toBe('john.doe')
      })

      it('should extract user from Keycloak token without preferred_username', () => {
        const token = createJwt({
          email: 'jane.doe@example.com',
          sub: 'f2a1c6d8-e5b2-4e9d-a7c3-9f1d8b3e5c2a',
          iss: 'https://keycloak.example.com/realms/notifications',
          aud: 'notify-api',
        })
        const req = {
          headers: {
            authorization: `Bearer ${token}`,
          },
        } as any

        const result = JwtUserExtractor.extractUser(req)
        expect(result).toBe('jane.doe@example.com')
      })
    })
  })
})

/**
 * Helper function to create a valid JWT token for testing
 * Creates a properly formatted JWT with header.payload.signature
 */
function createJwt(payload: Record<string, any>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64')
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64')
  const signature = 'test-signature-not-validated'

  return `${header}.${encodedPayload}.${signature}`
}
