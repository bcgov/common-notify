import { configureStore } from '@reduxjs/toolkit'
import authReducer from './slices/auth.slice'
import userReducer from './slices/user.slice'
import usersReducer from './slices/users.slice'
import cstarReducer from './slices/cstar.slice'
import loadingReducer from './slices/loading.slice'
import toastReducer from './slices/toast.slice'
import notificationReducer from './slices/notification.slice'
import notificationDetailReducer from './slices/notificationDetail.slice'
import codeTablesReducer from './slices/codeTables.slice'
import tenantReducer from './slices/tenant.slice'
import templatesReducer from './slices/templates.slice'
import eventsReducer from './slices/events.slice'
import featureFlagsReducer from './slices/featureFlags.slice'
import adminTenantsReducer from './slices/adminTenants.slice'
import apiKeysReducer from './slices/apiKeys.slice'
import apiKeyUsageReducer from './slices/apiKeyUsage.slice'
import tenantSettingsReducer from './slices/tenantSettings.slice'
import safelistReducer from './slices/safelist.slice'
import emailSettingsReducer from './slices/emailSettings.slice'
import smsSettingsReducer from './slices/smsSettings.slice'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    user: userReducer,
    users: usersReducer,
    cstar: cstarReducer,
    loading: loadingReducer,
    toast: toastReducer,
    notification: notificationReducer,
    notificationDetail: notificationDetailReducer,
    codeTables: codeTablesReducer,
    tenant: tenantReducer,
    templates: templatesReducer,
    events: eventsReducer,
    featureFlags: featureFlagsReducer,
    adminTenants: adminTenantsReducer,
    apiKeys: apiKeysReducer,
    apiKeyUsage: apiKeyUsageReducer,
    tenantSettings: tenantSettingsReducer,
    safelist: safelistReducer,
    emailSettings: emailSettingsReducer,
    smsSettings: smsSettingsReducer,
  },
})

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
