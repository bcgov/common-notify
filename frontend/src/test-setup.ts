import '@testing-library/jest-dom'
import { beforeAll, afterAll, afterEach } from 'vitest'
import { setupServer } from 'msw/node'

export const restHandlers = []

export const server = setupServer(...restHandlers)

// Start server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))

//  Close server after all tests
afterAll(() => server.close())

// Reset handlers after each test `important for test isolation`
afterEach(() => server.resetHandlers())
