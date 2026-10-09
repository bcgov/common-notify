import { beforeEach, describe, expect, it, vi } from 'vitest'
import userApi from './user.api'
import { get, post } from '@/common/api'
import type { AuthUser } from '@/interfaces/AuthUser'

vi.mock('@/common/api', () => ({
  get: vi.fn(),
  post: vi.fn(),
  generateApiParameters: vi.fn((url: string) => ({ url, requiresAuthentication: true })),
}))

const authUser = {
  id: 'u1',
  email: 'jane@gov.bc.ca',
  displayName: 'Doe, Jane',
  username: 'jdoe',
  givenName: 'Jane',
  familyName: 'Doe',
  roles: ['NOTIFY_ADMIN'],
  accessToken: 'token-value',
} as unknown as AuthUser

describe('user.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('upsertCurrentUser', () => {
    it('sends only the fields the upsert DTO accepts', async () => {
      vi.mocked(post).mockResolvedValue({ user: { id: 'u1' }, isNew: false })

      await userApi.upsertCurrentUser(authUser)

      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/frontend/users/me',
          data: {
            id: 'u1',
            email: 'jane@gov.bc.ca',
            displayName: 'Doe, Jane',
            username: 'jdoe',
            givenName: 'Jane',
            familyName: 'Doe',
          },
        }),
      )
    })

    it('does not forward the access token or roles', async () => {
      vi.mocked(post).mockResolvedValue({ user: { id: 'u1' }, isNew: true })

      await userApi.upsertCurrentUser(authUser)

      const { data } = vi.mocked(post).mock.calls[0][0] as { data: Record<string, unknown> }
      expect(data).not.toHaveProperty('accessToken')
      expect(data).not.toHaveProperty('roles')
    })

    it('lists per-field validation errors', async () => {
      vi.mocked(post).mockRejectedValue({
        response: {
          data: {
            message: 'Validation failed',
            fieldErrors: { email: ['must be an email'], username: ['should not be empty'] },
          },
        },
      })

      await expect(userApi.upsertCurrentUser(authUser)).rejects.toThrow(
        'Failed to upsert user:\nemail: must be an email\nusername: should not be empty',
      )
    })

    it('falls back to the response message when there are no field errors', async () => {
      vi.mocked(post).mockRejectedValue({ response: { data: { message: 'user is locked' } } })

      await expect(userApi.upsertCurrentUser(authUser)).rejects.toThrow(
        'Failed to upsert user:\nuser is locked',
      )
    })

    it('still throws when the failure carries no response body', async () => {
      vi.mocked(post).mockRejectedValue(new Error('Network Error'))

      await expect(userApi.upsertCurrentUser(authUser)).rejects.toThrow('Failed to upsert user:')
    })
  })

  describe('getAllUsers', () => {
    it('reads the users list', async () => {
      vi.mocked(get).mockResolvedValue({ users: [] })

      await expect(userApi.getAllUsers()).resolves.toEqual({ users: [] })
      expect(get).toHaveBeenCalledWith(expect.objectContaining({ url: '/api/v1/frontend/users' }))
    })

    it('explains a failure', async () => {
      vi.mocked(get).mockRejectedValue(new Error('403 Forbidden'))

      await expect(userApi.getAllUsers()).rejects.toThrow('Failed to fetch users: 403 Forbidden')
    })
  })
})
