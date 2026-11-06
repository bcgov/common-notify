import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test-utils'
import { Route } from './feature-flags'
vi.mock('@/components/FeatureFlagAdmin', () => ({ default: () => <h1>Feature flags</h1> }))

// The NOTIFY_ADMIN check is on the parent /admin route; see route.spec.tsx.
describe('feature flag administration route', () => {
  it('renders the feature flag page', () => {
    const Component = Route.options.component as () => React.ReactElement
    render(<Component />)
    expect(screen.getByRole('heading', { name: 'Feature flags' })).toBeInTheDocument()
  })
})
