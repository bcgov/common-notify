import '@bcgov/bc-sans/css/BC_Sans.css'
import { StrictMode } from 'react'
import * as ReactDOM from 'react-dom/client'
import { Provider as ReduxProvider } from 'react-redux'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { store } from '@/redux/store'
import { initializeAuthFromToken } from '@/redux/thunks/auth.thunks'
import UserService from './service/user-service'

// Import bootstrap styles
import '@/scss/styles.scss'

// Import the generated route tree
import { routeTree } from './routeTree.gen'

// Create a new router instance
const router = createRouter({ routeTree })

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const renderApp = () => {
  // Initialize auth from JWT token after Keycloak is initialized
  store.dispatch(initializeAuthFromToken())

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <StrictMode>
      <ReduxProvider store={store}>
        <RouterProvider router={router} />
      </ReduxProvider>
    </StrictMode>,
  )
}

UserService.initKeycloak(renderApp)
