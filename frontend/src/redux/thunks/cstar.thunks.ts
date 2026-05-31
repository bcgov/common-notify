import { createAsyncThunk } from '@reduxjs/toolkit'
import cstarApi from '@/api/cstar.api'
import type { Tenant } from '@/interfaces/CstarTenant'

export const fetchCstarTenants = createAsyncThunk<
  Tenant[],
  string,
  {
    rejectValue: string
  }
>('cstar/fetchTenants', async (ssoUserId, { rejectWithValue }) => {
  try {
    const response = await cstarApi.fetchUserTenants(ssoUserId)
    return response.data.tenants
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Failed to fetch tenants')
  }
})

export const fetchCstarRoles = createAsyncThunk<
  string[],
  { tenantId: string; ssoUserId: string },
  {
    rejectValue: string
  }
>('cstar/fetchRoles', async ({ tenantId, ssoUserId }, { rejectWithValue }) => {
  try {
    const baseUrl = cstarApi.getBaseUrl()
    const url = `${baseUrl}/api/v1/tenants/${tenantId}/ssousers/${ssoUserId}/roles`
    const response = await cstarApi.fetchUserRoles(url)
    // Extract role names from role objects
    const roleNames = response.data.roles.map((role) => role.name)
    return roleNames
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Failed to fetch roles')
  }
})
