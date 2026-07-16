import { createFileRoute } from '@tanstack/react-router'
import Usage from '@/pages/usage/Usage'

export const Route = createFileRoute('/usage')({
  component: UsagePage,
})

function UsagePage() {
  return <Usage />
}
