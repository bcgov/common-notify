import type { PreloadedState } from '@reduxjs/toolkit'
import { configureStore } from '@reduxjs/toolkit'
import { upsertCurrentUserAsync, getAllUsersAsync } from './user.thunks'
import userReducer from '../slices/user.slice'
import usersReducer from '../slices/users.slice'
import type { RootState } from '../store'
import type { AuthUser } from '@/interfaces/AuthUser'
import type { UserResponse } from '@/interfaces/User'

// Mock the user API
jest.mock('@/api/user.api', () => ({
  __esModule: true,
  default: {
    upsertCurrentUser: jest.fn(),
    getAllUsers: jest.fn(),
  },
}))

import userApi from '@/api/user.api'

describe('User Thunks - Smart Upsert Logic', () => {
  let store: ReturnType<typeof configureStore>

  function createStore(preloadedState?: PreloadedState<RootState>) {
    return configureStore({
      reducer: {
        user: userReducer,
        users: usersReducer,
      },
      preloadedState,
    })
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('upsertCurrentUserAsync - New User (API call expected)', () => {
    it('should call API when user does not exist in Redux state', async () => {
      store = createStore({
        user: {
          current: null,
          isLoading: false,
          error: null,
        },
        users: {
          allUsers: [],
          isLoading: false,
          error: null,
        },
      })

      const authUser: AuthUser = {
        id: 'ext-123',
        email: 'john@example.com',
        username: 'john.doe',
        displayName: 'John Doe',
        givenName: 'John',
        familyName: 'Doe',
      }

      const mockResponse = {
        user: {
          id: 'user-123',
          externalId: 'ext-123',
          email: 'john@example.com',
          username: 'john.doe',
          displayName: 'John Doe',
          givenName: 'John',
          familyName: 'Doe',
          createdAt: '2024-01-01T00:00:00Z',
          createdBy: 'system',
          updatedAt: '2024-01-01T00:00:00Z',
          updatedBy: 'system',
          isDeleted: false,
        } as UserResponse,
        isNew: true,
        message: 'User created successfully',
      }

      ;(userApi.upsertCurrentUser as jest.Mock).mockResolvedValueOnce(mockResponse)

      const result = await store.dispatch(upsertCurrentUserAsync(authUser))

      expect(userApi.upsertCurrentUser).toHaveBeenCalledTimes(1)
      expect(userApi.upsertCurrentUser).toHaveBeenCalledWith(authUser)
      expect(result.payload).toEqual(mockResponse.user)
      expect(result.meta.requestStatus).toBe('fulfilled')
    })
  })

  describe('upsertCurrentUserAsync - Existing User, No Changes (API call skipped)', () => {
    it('should skip API call when user exists and data is identical', async () => {
      const existingUser: UserResponse = {
        id: 'user-123',
        externalId: 'ext-123',
        email: 'john@example.com',
        username: 'john.doe',
        displayName: 'John Doe',
        givenName: 'John',
        familyName: 'Doe',
        createdAt: '2024-01-01T00:00:00Z',
        createdBy: 'system',
        updatedAt: '2024-01-01T00:00:00Z',
        updatedBy: 'system',
        isDeleted: false,
      }

      store = createStore({
        user: {
          current: null,
          allUsers: [existingUser],
          isLoading: false,
          error: null,
        },
      })

      const authUser: AuthUser = {
        id: 'ext-123',
        email: 'john@example.com',
        username: 'john.doe',
        displayName: 'John Doe',
        givenName: 'John',
        familyName: 'Doe',
      }

      const result = await store.dispatch(upsertCurrentUserAsync(authUser))

      // API should NOT be called
      expect(userApi.upsertCurrentUser).not.toHaveBeenCalled()
      // Should return cached user
      expect(result.payload).toEqual(existingUser)
      expect(result.meta.requestStatus).toBe('fulfilled')
    })
  })

  describe('upsertCurrentUserAsync - Existing User, Data Changed (API call expected)', () => {
    it('should call API when user exists but email has changed', async () => {
      const existingUser: UserResponse = {
        id: 'user-123',
        externalId: 'ext-123',
        email: 'john.old@example.com',
        username: 'john.doe',
        displayName: 'John Doe',
        givenName: 'John',
        familyName: 'Doe',
        createdAt: '2024-01-01T00:00:00Z',
        createdBy: 'system',
        updatedAt: '2024-01-01T00:00:00Z',
        updatedBy: 'system',
        isDeleted: false,
      }

      store = createStore({
        user: {
          current: null,
          allUsers: [existingUser],
          isLoading: false,
          error: null,
        },
      })

      const authUser: AuthUser = {
        id: 'ext-123',
        email: 'john.new@example.com', // Changed email
        username: 'john.doe',
        displayName: 'John Doe',
        givenName: 'John',
        familyName: 'Doe',
      }

      const mockResponse = {
        user: {
          ...existingUser,
          email: 'john.new@example.com',
          updatedAt: '2024-01-02T00:00:00Z',
        },
        isNew: false,
        message: 'User updated successfully',
      }

      ;(userApi.upsertCurrentUser as jest.Mock).mockResolvedValueOnce(mockResponse)

      const result = await store.dispatch(upsertCurrentUserAsync(authUser))

      // API SHOULD be called because email changed
      expect(userApi.upsertCurrentUser).toHaveBeenCalledTimes(1)
      expect(userApi.upsertCurrentUser).toHaveBeenCalledWith(authUser)
      expect(result.payload.email).toBe('john.new@example.com')
      expect(result.meta.requestStatus).toBe('fulfilled')
    })

    it('should call API when user exists but displayName has changed', async () => {
      const existingUser: UserResponse = {
        id: 'user-123',
        externalId: 'ext-123',
        email: 'john@example.com',
        username: 'john.doe',
        displayName: 'John Doe',
        givenName: 'John',
        familyName: 'Doe',
        createdAt: '2024-01-01T00:00:00Z',
        createdBy: 'system',
        updatedAt: '2024-01-01T00:00:00Z',
        updatedBy: 'system',
        isDeleted: false,
      }

      store = createStore({
        user: {
          current: null,
          allUsers: [existingUser],
          isLoading: false,
          error: null,
        },
      })

      const authUser: AuthUser = {
        id: 'ext-123',
        email: 'john@example.com',
        username: 'john.doe',
        displayName: 'John Michael Doe', // Changed displayName
        givenName: 'John',
        familyName: 'Doe',
      }

      const mockResponse = {
        user: {
          ...existingUser,
          displayName: 'John Michael Doe',
          updatedAt: '2024-01-02T00:00:00Z',
        },
        isNew: false,
        message: 'User updated successfully',
      }

      ;(userApi.upsertCurrentUser as jest.Mock).mockResolvedValueOnce(mockResponse)

      const result = await store.dispatch(upsertCurrentUserAsync(authUser))

      expect(userApi.upsertCurrentUser).toHaveBeenCalledTimes(1)
      expect(result.payload.displayName).toBe('John Michael Doe')
    })

    it('should call API when user exists but username has changed', async () => {
      const existingUser: UserResponse = {
        id: 'user-123',
        externalId: 'ext-123',
        email: 'john@example.com',
        username: 'john.doe',
        displayName: 'John Doe',
        givenName: 'John',
        familyName: 'Doe',
        createdAt: '2024-01-01T00:00:00Z',
        createdBy: 'system',
        updatedAt: '2024-01-01T00:00:00Z',
        updatedBy: 'system',
        isDeleted: false,
      }

      store = createStore({
        user: {
          current: null,
          allUsers: [existingUser],
          isLoading: false,
          error: null,
        },
      })

      const authUser: AuthUser = {
        id: 'ext-123',
        email: 'john@example.com',
        username: 'jdoe123', // Changed username
        displayName: 'John Doe',
        givenName: 'John',
        familyName: 'Doe',
      }

      const mockResponse = {
        user: {
          ...existingUser,
          username: 'jdoe123',
          updatedAt: '2024-01-02T00:00:00Z',
        },
        isNew: false,
        message: 'User updated successfully',
      }

      ;(userApi.upsertCurrentUser as jest.Mock).mockResolvedValueOnce(mockResponse)

      const result = await store.dispatch(upsertCurrentUserAsync(authUser))

      expect(userApi.upsertCurrentUser).toHaveBeenCalledTimes(1)
      expect(result.payload.username).toBe('jdoe123')
    })

    it('should call API when multiple fields have changed', async () => {
      const existingUser: UserResponse = {
        id: 'user-123',
        externalId: 'ext-123',
        email: 'old@example.com',
        username: 'old.user',
        displayName: 'Old Name',
        givenName: 'Old',
        familyName: 'Name',
        createdAt: '2024-01-01T00:00:00Z',
        createdBy: 'system',
        updatedAt: '2024-01-01T00:00:00Z',
        updatedBy: 'system',
        isDeleted: false,
      }

      store = createStore({
        user: {
          current: null,
          allUsers: [existingUser],
          isLoading: false,
          error: null,
        },
      })

      const authUser: AuthUser = {
        id: 'ext-123',
        email: 'new@example.com', // Changed
        username: 'new.user', // Changed
        displayName: 'New Name', // Changed
        givenName: 'New', // Changed
        familyName: 'Name',
      }

      const mockResponse = {
        user: {
          ...existingUser,
          email: 'new@example.com',
          username: 'new.user',
          displayName: 'New Name',
          givenName: 'New',
          updatedAt: '2024-01-02T00:00:00Z',
        },
        isNew: false,
        message: 'User updated successfully',
      }

      ;(userApi.upsertCurrentUser as jest.Mock).mockResolvedValueOnce(mockResponse)

      const result = await store.dispatch(upsertCurrentUserAsync(authUser))

      expect(userApi.upsertCurrentUser).toHaveBeenCalledTimes(1)
      expect(result.payload.email).toBe('new@example.com')
      expect(result.payload.username).toBe('new.user')
      expect(result.payload.displayName).toBe('New Name')
    })
  })

  describe('upsertCurrentUserAsync - Edge Cases', () => {
    it('should skip API call when optional fields are undefined in both places', async () => {
      const existingUser: UserResponse = {
        id: 'user-123',
        externalId: 'ext-123',
        email: 'john@example.com',
        username: 'john.doe',
        displayName: 'John Doe',
        // givenName and familyName are undefined (optional)
        createdAt: '2024-01-01T00:00:00Z',
        createdBy: 'system',
        updatedAt: '2024-01-01T00:00:00Z',
        updatedBy: 'system',
        isDeleted: false,
      }

      store = createStore({
        user: {
          current: null,
          allUsers: [existingUser],
          isLoading: false,
          error: null,
        },
      })

      const authUser: AuthUser = {
        id: 'ext-123',
        email: 'john@example.com',
        username: 'john.doe',
        displayName: 'John Doe',
        // givenName and familyName are undefined
      }

      const result = await store.dispatch(upsertCurrentUserAsync(authUser))

      // Should skip API call - no changes
      expect(userApi.upsertCurrentUser).not.toHaveBeenCalled()
      expect(result.payload).toEqual(existingUser)
    })

    it('should call API when undefined value becomes defined', async () => {
      const existingUser: UserResponse = {
        id: 'user-123',
        externalId: 'ext-123',
        email: 'john@example.com',
        username: 'john.doe',
        displayName: 'John Doe',
        // givenName is undefined
        familyName: 'Doe',
        createdAt: '2024-01-01T00:00:00Z',
        createdBy: 'system',
        updatedAt: '2024-01-01T00:00:00Z',
        updatedBy: 'system',
        isDeleted: false,
      }

      store = createStore({
        user: {
          current: null,
          allUsers: [existingUser],
          isLoading: false,
          error: null,
        },
      })

      const authUser: AuthUser = {
        id: 'ext-123',
        email: 'john@example.com',
        username: 'john.doe',
        displayName: 'John Doe',
        givenName: 'John', // Now defined (changed)
        familyName: 'Doe',
      }

      const mockResponse = {
        user: {
          ...existingUser,
          givenName: 'John',
          updatedAt: '2024-01-02T00:00:00Z',
        },
        isNew: false,
        message: 'User updated successfully',
      }

      ;(userApi.upsertCurrentUser as jest.Mock).mockResolvedValueOnce(mockResponse)

      const result = await store.dispatch(upsertCurrentUserAsync(authUser))

      // API should be called - givenName changed from undefined to 'John'
      expect(userApi.upsertCurrentUser).toHaveBeenCalledTimes(1)
      expect(result.payload.givenName).toBe('John')
    })

    it('should handle API errors gracefully', async () => {
      store = createStore({
        user: {
          current: null,
          isLoading: false,
          error: null,
        },
        users: {
          allUsers: [],
          isLoading: false,
          error: null,
        },
      })

      const authUser: AuthUser = {
        id: 'ext-123',
        email: 'john@example.com',
        username: 'john.doe',
        displayName: 'John Doe',
      }

      const mockError = new Error('Network error')
      ;(userApi.upsertCurrentUser as jest.Mock).mockRejectedValueOnce(mockError)

      const result = await store.dispatch(upsertCurrentUserAsync(authUser))

      expect(result.meta.requestStatus).toBe('rejected')
      expect(result.payload).toBe('Network error')
    })
  })

  describe('Performance Impact', () => {
    it('should reduce API calls when user data is stable on re-renders', async () => {
      const existingUser: UserResponse = {
        id: 'user-123',
        externalId: 'ext-123',
        email: 'john@example.com',
        username: 'john.doe',
        displayName: 'John Doe',
        givenName: 'John',
        familyName: 'Doe',
        createdAt: '2024-01-01T00:00:00Z',
        createdBy: 'system',
        updatedAt: '2024-01-01T00:00:00Z',
        updatedBy: 'system',
        isDeleted: false,
      }

      store = createStore({
        user: {
          current: null,
          allUsers: [existingUser],
          isLoading: false,
          error: null,
        },
      })

      const authUser: AuthUser = {
        id: 'ext-123',
        email: 'john@example.com',
        username: 'john.doe',
        displayName: 'John Doe',
        givenName: 'John',
        familyName: 'Doe',
      }

      // Simulate multiple calls with same data
      await store.dispatch(upsertCurrentUserAsync(authUser))
      await store.dispatch(upsertCurrentUserAsync(authUser))
      await store.dispatch(upsertCurrentUserAsync(authUser))

      // API should only be called once (or zero times if cached)
      expect(userApi.upsertCurrentUser).not.toHaveBeenCalled()
    })
  })
})
