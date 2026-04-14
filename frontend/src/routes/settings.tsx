import { createFileRoute } from '@tanstack/react-router'
import Settings from '@/containers/pages/settings/Settings'

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  return <Settings />
}
