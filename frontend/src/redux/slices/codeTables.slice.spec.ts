import { describe, it, expect } from 'vitest'
import codeTablesReducer, {
  selectStatuses,
  selectChannels,
  selectEventTypes,
  selectCodeTablesLoading,
  selectCodeTablesError,
  clearError,
} from '@/redux/slices/codeTables.slice'
import { fetchCodeTables } from '@/redux/thunks/codeTables.thunks'
import type { CodeTablesState } from '@/interfaces/CodeTables'

describe('codeTables.slice', () => {
  const initialState: CodeTablesState = {
    statuses: [],
    channels: [],
    eventTypes: [],
    isLoading: false,
    error: null,
  }

  const mockStatuses = [
    { id: 'sent', label: 'Sent', description: 'sent' },
    { id: 'failed', label: 'Failed', description: 'failed' },
    { id: 'pending', label: 'Pending', description: 'pending' },
  ]

  const mockChannels = [
    { id: 'EMAIL', label: 'Email', description: 'EMAIL' },
    { id: 'SMS', label: 'SMS', description: 'SMS' },
  ]

  const mockEventTypes = [
    { id: 'PASSWORD_RESET', label: 'Password Reset', description: 'PASSWORD_RESET' },
    { id: 'INVOICE_SENT', label: 'Invoice Sent', description: 'INVOICE_SENT' },
  ]

  describe('reducers', () => {
    it('should return initial state', () => {
      const state = codeTablesReducer(undefined, { type: 'unknown' })
      expect(state).toEqual(initialState)
    })

    it('should handle clearError', () => {
      const previousState: CodeTablesState = {
        ...initialState,
        error: 'Some error occurred',
      }
      const state = codeTablesReducer(previousState, clearError())
      expect(state.error).toBeNull()
    })
  })

  describe('extraReducers - fetchCodeTables', () => {
    it('should handle fetchCodeTables.pending', () => {
      const state = codeTablesReducer(initialState, fetchCodeTables.pending())
      expect(state.isLoading).toBe(true)
      expect(state.error).toBeNull()
    })

    it('should handle fetchCodeTables.fulfilled', () => {
      const payload: CodeTablesState = {
        statuses: mockStatuses,
        channels: mockChannels,
        eventTypes: mockEventTypes,
        isLoading: false,
        error: null,
      }

      const state = codeTablesReducer(
        initialState,
        fetchCodeTables.fulfilled(payload, '', undefined),
      )
      expect(state.isLoading).toBe(false)
      expect(state.statuses).toEqual(mockStatuses)
      expect(state.channels).toEqual(mockChannels)
      expect(state.eventTypes).toEqual(mockEventTypes)
      expect(state.error).toBeNull()
    })

    it('should handle fetchCodeTables.rejected', () => {
      const errorMessage = 'Failed to fetch code tables'
      const state = codeTablesReducer(
        initialState,
        fetchCodeTables.rejected(null, '', undefined, errorMessage),
      )
      expect(state.isLoading).toBe(false)
      expect(state.error).toBe(errorMessage)
      expect(state.statuses).toEqual([])
      expect(state.channels).toEqual([])
      expect(state.eventTypes).toEqual([])
    })
  })

  describe('selectors', () => {
    const testState = {
      codeTables: {
        statuses: mockStatuses,
        channels: mockChannels,
        eventTypes: mockEventTypes,
        isLoading: false,
        error: null,
      },
    }

    it('selectStatuses should return statuses array', () => {
      const result = selectStatuses(testState as any)
      expect(result).toEqual(mockStatuses)
    })

    it('selectChannels should return channels array', () => {
      const result = selectChannels(testState as any)
      expect(result).toEqual(mockChannels)
    })

    it('selectEventTypes should return event types array', () => {
      const result = selectEventTypes(testState as any)
      expect(result).toEqual(mockEventTypes)
    })

    it('selectCodeTablesLoading should return loading state', () => {
      const result = selectCodeTablesLoading(testState as any)
      expect(result).toBe(false)
    })

    it('selectCodeTablesError should return error state', () => {
      const result = selectCodeTablesError(testState as any)
      expect(result).toBeNull()
    })

    it('selectCodeTablesError should return error message when present', () => {
      const stateWithError = {
        codeTables: {
          ...testState.codeTables,
          error: 'API Error',
        },
      }
      const result = selectCodeTablesError(stateWithError as any)
      expect(result).toBe('API Error')
    })
  })
})
