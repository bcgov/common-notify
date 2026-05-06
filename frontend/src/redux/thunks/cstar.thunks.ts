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
    return rejectWithValue(
      error instanceof Error ? error.message : 'Failed to fetch tenants',
    )
  }
})
