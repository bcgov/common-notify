import { createFileRoute, redirect } from '@tanstack/react-router'
import QueuesAndProcessing from '@/pages/admin/monitoring/QueuesAndProcessing'

/**
 * This page used to hold every monitoring view behind ?tab=. Bookmarks and shared links still
 * carry the tab, so each one is sent to the page its content now lives on.
 */
const LEGACY_TABS: Record<string, '/admin' | '/admin/monitoring'> = {
  overview: '/admin',
  failures: '/admin',
  system: '/admin/monitoring',
}

export const Route = createFileRoute('/admin/monitoring')({
  validateSearch: (search: Record<string, unknown>): { tab?: string } =>
    typeof search.tab === 'string' ? { tab: search.tab } : {},
  beforeLoad: ({ search }) => {
    if (search.tab !== undefined) {
      throw redirect({ to: LEGACY_TABS[search.tab] ?? '/admin/monitoring', replace: true })
    }
  },
  component: QueuesAndProcessing,
})
