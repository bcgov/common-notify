import { createFileRoute } from '@tanstack/react-router'
import Homepage from '@/pages/home/Homepage'

export const Route = createFileRoute('/')({
  component: Index,
})

function Index() {
  return <Homepage />
}
