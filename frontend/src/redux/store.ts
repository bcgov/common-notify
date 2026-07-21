import { configureStore } from '@reduxjs/toolkit'
import authReducer from './slices/auth.slice'
import userReducer from './slices/user.slice'
import usersReducer from './slices/users.slice'
import cstarReducer from './slices/cstar.slice'
import loadingReducer from './slices/loading.slice'
import toastReducer from './slices/toast.slice'
import notificationReducer from './slices/notification.slice'
import codeTablesReducer from './slices/codeTables.slice'
import tenantReducer from './slices/tenant.slice'
import templatesReducer from './slices/templates.slice'
import featureFlagsReducer from './slices/featureFlags.slice'
import adminTenantsReducer from './slices/adminTenants.slice'
import apiKeysReducer from './slices/apiKeys.slice'
import apiKeyUsageReducer from './slices/apiKeyUsage.slice'
import tenantSettingsReducer from './slices/tenantSettings.slice'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    user: userReducer,
    users: usersReducer,
    cstar: cstarReducer,
    loading: loadingReducer,
    toast: toastReducer,
    notification: notificationReducer,
    codeTables: codeTablesReducer,
    tenant: tenantReducer,
    templates: templatesReducer,
    featureFlags: featureFlagsReducer,
    adminTenants: adminTenantsReducer,
    apiKeys: apiKeysReducer,
    apiKeyUsage: apiKeyUsageReducer,
    tenantSettings: tenantSettingsReducer,
  },
})

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
