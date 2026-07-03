import { createAsyncThunk } from '@reduxjs/toolkit'
import {
  getApiKeyUsage,
  getApiKeyUsageHistory,
  getAllTenantsUsage,
  updateApiKeyThreshold,
  updateTenantLimits as updateTenantLimitsApi,
} from '@/api/apiKeyUsage.api'
import type {
  TenantUsageResponse,
  UsageHistoryEntry,
  UpdateThresholdRequest,
  PaginatedAdminUsageResponse,
  UpdateTenantLimitsRequest,
  AdminTenantUsageRow,
} from '@/api/apiKeyUsage.api'
import type { RootState } from '../store'

const emptyUsage: TenantUsageResponse = { tenantId: '', fiscalYearStart: '', channels: [] }

export const fetchApiKeyUsage = createAsyncThunk<
  TenantUsageResponse,
  void,
  { state: RootState; rejectValue: string }
>('apiKeyUsage/fetch', async (_, { getState, rejectWithValue }) => {
  try {
    const tenantId = getState().tenant.selectedTenant?.id
    if (!tenantId) return emptyUsage
    return await getApiKeyUsage()
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Failed to load usage')
  }
})

export const fetchApiKeyUsageHistory = createAsyncThunk<
  UsageHistoryEntry[],
  void,
  { state: RootState; rejectValue: string }
>('apiKeyUsage/fetchHistory', async (_, { getState, rejectWithValue }) => {
  try {
    const tenantId = getState().tenant.selectedTenant?.id
    if (!tenantId) return []
    return await getApiKeyUsageHistory()
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Failed to load usage history')
  }
})

export const fetchAllTenantsUsage = createAsyncThunk<
  PaginatedAdminUsageResponse,
  void,
  { state: RootState; rejectValue: string }
>('apiKeyUsage/fetchAllTenants', async (_, { getState, rejectWithValue }) => {
  try {
    const { adminPage, adminLimit, adminSearch } = getState().apiKeyUsage
    return await getAllTenantsUsage(adminPage, adminLimit, adminSearch || undefined)
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Failed to load tenant usage')
  }
})

export const updateTenantLimits = createAsyncThunk<
  AdminTenantUsageRow[],
  UpdateTenantLimitsRequest,
  { rejectValue: string }
>('apiKeyUsage/updateTenantLimits', async (payload, { rejectWithValue }) => {
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
>('apiKeyUsage/updateThreshold', async (payload, { rejectWithValue }) => {
  try {
    return await updateApiKeyThreshold(payload)
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Failed to update threshold')
  }
})
