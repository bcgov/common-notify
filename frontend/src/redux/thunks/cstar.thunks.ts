import { createAsyncThunk } from '@reduxjs/toolkit'
import cstarApi from '@/api/cstar.api'
import type { Tenant } from '@/interfaces/CstarTenant'

/**
 * Fetch current user's CSTAR tenants
 *
 * Backend endpoint: GET /api/v1/frontend/auth/tenants
 * Backend extracts user ID from JWT, so no parameters needed
 *
 * @returns Array of tenants the user has access to
 */
export const fetchCstarTenants = createAsyncThunk<
  Tenant[],
  void,
  {
    rejectValue: string
  }
>('cstar/fetchTenants', async (_, { rejectWithValue }) => {
  try {
    const response = await cstarApi.fetchUserTenants()
    return response.data.tenants
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Failed to fetch tenants')
  }
})

/**
 * Fetch current user's CSTAR roles in a specific tenant
 *
 * Backend endpoint: GET /api/v1/frontend/auth/tenants/:tenantId/roles
 * Backend extracts user ID from JWT, so only tenantId is needed
 *
 * @param tenantId The tenant ID to fetch roles for
 * @returns Array of role names for the user in that tenant
 */
export const fetchCstarRoles = createAsyncThunk<
  string[],
  { tenantId: string },
  {
    rejectValue: string
  }
>('cstar/fetchRoles', async ({ tenantId }, { rejectWithValue }) => {
  try {
    const response = await cstarApi.fetchUserRoles(tenantId)
    return response.data.roles
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Failed to fetch roles')
  }
})
