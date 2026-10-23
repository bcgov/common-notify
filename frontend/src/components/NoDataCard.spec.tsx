import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import NoDataCard from './NoDataCard'

const navigateMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

function renderCard(isActionDisabled?: boolean) {
  render(
    <NoDataCard
      title="No templates yet."
      message="Templates will appear here."
      actionLabel="Create notification template"
      actionTo="/template-create"
      isActionDisabled={isActionDisabled}
    />,
  )
}

describe('NoDataCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the title and message', () => {
    renderCard()

    expect(screen.getByText('No templates yet.')).toBeInTheDocument()
    expect(screen.getByText('Templates will appear here.')).toBeInTheDocument()
  })

  it('navigates to the create page when the action is pressed', () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Create notification template' }))

    expect(navigateMock).toHaveBeenCalledWith({ to: '/template-create' })
  })

  it('disables the action when asked', () => {
    renderCard(true)

    expect(screen.getByRole('button', { name: 'Create notification template' })).toBeDisabled()
  })
})
