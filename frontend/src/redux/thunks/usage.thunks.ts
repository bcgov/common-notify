import { createAsyncThunk } from '@reduxjs/toolkit'
import {
  getTenantUsage,
  getTenantUsageHistory,
  getAllTenantsUsage,
  updateApiKeyThreshold,
  updateTenantLimits as updateTenantLimitsApi,
} from '@/api/usage.api'
import type {
  TenantUsageResponse,
  UsageHistoryEntry,
  UpdateThresholdRequest,
  PaginatedAdminUsageResponse,
  UpdateTenantLimitsRequest,
  AdminTenantUsageRow,
} from '@/api/usage.api'
import type { RootState } from '../store'
import { toFilterParams, toSortParam } from '../utils/listFilters'

const emptyUsage: TenantUsageResponse = { tenantId: '', fiscalYearStart: '', channels: [] }

export const fetchTenantUsage = createAsyncThunk<
  TenantUsageResponse,
  void,
  { state: RootState; rejectValue: string }
>('usage/fetch', async (_, { getState, rejectWithValue }) => {
  try {
    const tenantId = getState().tenant.selectedTenant?.id
    if (!tenantId) return emptyUsage
    return await getTenantUsage()
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Failed to load usage')
  }
})

export const fetchTenantUsageHistory = createAsyncThunk<
  UsageHistoryEntry[],
  void,
  { state: RootState; rejectValue: string }
>('usage/fetchHistory', async (_, { getState, rejectWithValue }) => {
  try {
    const tenantId = getState().tenant.selectedTenant?.id
    if (!tenantId) return []
    return await getTenantUsageHistory()
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Failed to load usage history')
  }
})

export const fetchAllTenantsUsage = createAsyncThunk<
  PaginatedAdminUsageResponse,
  void,
  { state: RootState; rejectValue: string }
>('usage/fetchAllTenants', async (_, { getState, rejectWithValue }) => {
  try {
    const { adminPage, adminLimit, adminSearch, adminFilters, adminSortBy, adminSortOrder } =
      getState().usage
    return await getAllTenantsUsage(
      adminPage,
      adminLimit,
      adminSearch || undefined,
      toFilterParams(adminFilters),
      toSortParam(adminSortBy, adminSortOrder),
    )
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Failed to load tenant usage')
  }
})

export const updateTenantLimits = createAsyncThunk<
  AdminTenantUsageRow[],
  UpdateTenantLimitsRequest,
  { rejectValue: string }
>('usage/updateTenantLimits', async (payload, { rejectWithValue }) => {
  try {
    return await updateTenantLimitsApi(payload)
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Failed to update limits')
  }
})

export const updateThreshold = createAsyncThunk<
  TenantUsageResponse,
  UpdateThresholdRequest,
  { rejectValue: string }
>('usage/updateThreshold', async (payload, { rejectWithValue }) => {
  try {
    return await updateApiKeyThreshold(payload)
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Failed to update threshold')
  }
})
