import { createAsyncThunk } from '@reduxjs/toolkit'
import {
  getApiKeyUsage,
  getApiKeyUsageHistory,
  getAllTenantsUsage,
  updateApiKeyThreshold,
} from '@/api/apiKeyUsage.api'
import type {
  TenantUsageResponse,
  UsageHistoryEntry,
  UpdateThresholdRequest,
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
  AdminTenantUsageRow[],
  void,
  { rejectValue: string }
>('apiKeyUsage/fetchAllTenants', async (_, { rejectWithValue }) => {
  try {
    return await getAllTenantsUsage()
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Failed to load tenant usage')
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
