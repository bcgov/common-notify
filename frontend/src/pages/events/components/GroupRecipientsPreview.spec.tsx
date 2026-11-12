import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import GroupRecipientsPreview from './GroupRecipientsPreview'
import { previewGroupRecipients } from '@/api/mcpRegistry.api'

vi.mock('@/redux/hooks', () => ({
  useAppSelector: (select: any) => select({ tenant: { selectedTenant: { id: 'tenant-a' } } }),
}))
vi.mock('@/api/mcpRegistry.api', () => ({ previewGroupRecipients: vi.fn() }))

describe('read-only group recipient preview', () => {
  it('resolves selected group IDs and clears results when the selection changes', async () => {
    vi.mocked(previewGroupRecipients).mockResolvedValue({ emails: ['alex@example.invalid'] })
    const user = userEvent.setup()
    const { rerender } = render(<GroupRecipientsPreview groupIds={['group-a']} />)
    await user.click(screen.getByRole('button', { name: 'Preview group recipients' }))
    expect(await screen.findByText('alex@example.invalid')).toBeInTheDocument()
    expect(previewGroupRecipients).toHaveBeenCalledWith(['group-a'])
    rerender(<GroupRecipientsPreview groupIds={[]} />)
    expect(screen.queryByText('alex@example.invalid')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Preview group recipients' })).toBeDisabled()
  })
})
