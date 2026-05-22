import { createAsyncThunk } from '@reduxjs/toolkit'
import type { AxiosError } from 'axios'
import { get, post, patch, deleteMethod } from '@/common/api'
import type { FeatureFlag } from '@/interfaces/feature-flag.interface'

/**
 * Fetch feature flags for the user's tenant
 * Called on app load or when tenant changes
 */
export const fetchFeatureFlags = createAsyncThunk(
  'featureFlags/fetch',
  async (tenantId: string | undefined, { rejectWithValue }) => {
    try {
      // If a specific tenant ID is provided, pass it as a header
      // This allows checking flags for a specific tenant (with tenant-specific overrides)
      // If not provided, the request interceptor will use the selected tenant from localStorage
      const headers = tenantId ? { 'X-Tenant-ID': tenantId } : undefined

      const response = await get(
        {
          url: '/api/v1/feature-flags',
        },
        headers,
      )

      const data: Record<string, boolean> = response
      return { flags: data, tenantId }
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : 'Failed to fetch feature flags',
      )
    }
  },
)

/**
 * Fetch all feature flags for admin view
 */
export const fetchAllFeatureFlags = createAsyncThunk(
  'featureFlags/fetchAll',
  async (_, { rejectWithValue }) => {
    try {
      const response = await get({
        url: '/api/v1/frontend/admin/feature-flags',
      })

      const data: FeatureFlag[] = response
      return data
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : 'Failed to fetch feature flags',
      )
    }
  },
)

/**
 * Create a new feature flag
 * Admin only operation
 */
export const createFeatureFlag = createAsyncThunk(
  'featureFlags/create',
  async (payload: { code: string; enabled: boolean; tenantId?: string }, { rejectWithValue }) => {
    try {
      const newFlag: FeatureFlag = await post({
        url: '/api/v1/frontend/admin/feature-flags',
        params: payload,
      })
      return newFlag
    } catch (error) {
      const axiosError = error as AxiosError
      const responseData = (axiosError.response?.data as any) || {}
      const errorMessage =
        responseData.message ||
        (error instanceof Error ? error.message : 'Failed to create feature flag')
      return rejectWithValue(errorMessage)
    }
  },
)

/**
 * Update a feature flag (toggle enabled/disabled)
 * Admin only operation
 */
export const updateFeatureFlag = createAsyncThunk(
  'featureFlags/update',
  async ({ id, enabled }: { id: string; enabled: boolean }, { rejectWithValue }) => {
    try {
      await patch({
        url: `/api/v1/frontend/admin/feature-flags/${id}`,
        params: { enabled },
      })
      return { id, enabled }
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : 'Failed to update feature flag',
      )
    }
  },
)

/**
 * Delete a feature flag
 * Admin only operation
 */
export const deleteFeatureFlag = createAsyncThunk(
  'featureFlags/delete',
  async (id: string, { rejectWithValue }) => {
    try {
      await deleteMethod({
        url: `/api/v1/frontend/admin/feature-flags/${id}`,
      })
      return id
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : 'Failed to delete feature flag',
      )
    }
  },
)
