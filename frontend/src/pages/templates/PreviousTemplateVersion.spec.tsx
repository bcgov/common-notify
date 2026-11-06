import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type * as TemplatesApi from '@/api/templates.api'
import PreviousTemplateVersion from './PreviousTemplateVersion'

const getPreviousTemplateVersionMock = vi.fn()

vi.mock('@/api/templates.api', async () => {
  const actual = await vi.importActual<typeof TemplatesApi>('@/api/templates.api')
  return {
    ...actual,
    getPreviousTemplateVersion: (...args: unknown[]) => getPreviousTemplateVersionMock(...args),
  }
})

const template = {
  id: 'template-123',
  version: 2,
  updatedAt: '2026-08-13T17:43:00Z',
  updatedByName: 'Isabella Samantha',
}

const previousVersion = {
  version: 1,
  name: 'New Order Ready',
  subject: 'Pizza Pizza',
  body: 'Hello {{first name}},',
  createdByName: 'Barrett Falk',
  createdAt: '2026-06-12T17:00:00Z',
}

const openModal = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'See previous version' }))
  return screen.findByRole('dialog', { name: 'Previous Version' })
}

describe('PreviousTemplateVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPreviousTemplateVersionMock.mockResolvedValue(previousVersion)
  })

  it('shows who last updated the template', () => {
    render(<PreviousTemplateVersion template={template} />)

    expect(screen.getByText(/^Last updated on .*, by Isabella Samantha\./)).toBeTruthy()
  })

  it('leaves out the name when none was recorded', () => {
    render(<PreviousTemplateVersion template={{ ...template, updatedByName: null }} />)

    expect(screen.getByText(/^Last updated on /).textContent).not.toContain(', by ')
  })

  it('offers no link on the first version, which has nothing before it', () => {
    render(<PreviousTemplateVersion template={{ ...template, version: 1 }} />)

    expect(screen.queryByRole('button', { name: 'See previous version' })).toBeNull()
  })

  it('loads nothing until the modal is opened', () => {
    render(<PreviousTemplateVersion template={template} />)

    expect(getPreviousTemplateVersionMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('loads and shows the previous version when opened', async () => {
    render(<PreviousTemplateVersion template={template} />)

    await openModal()

    expect(getPreviousTemplateVersionMock).toHaveBeenCalledWith('template-123')
    expect(await screen.findByRole('heading', { name: 'New Order Ready' })).toBeTruthy()
    expect(screen.getByText(/^Edit made on .*, by Barrett Falk\.$/)).toBeTruthy()
    expect(screen.getByText('Pizza Pizza')).toBeTruthy()
    expect(screen.getByText('Hello {{first name}},')).toBeTruthy()
    expect(screen.queryByText('Template Preview')).toBeNull()
  })

  it('leaves out the name and subject line when the version has neither', async () => {
    getPreviousTemplateVersionMock.mockResolvedValue({
      ...previousVersion,
      subject: null,
      createdByName: null,
    })

    render(<PreviousTemplateVersion template={template} />)

    await openModal()

    const edited = await screen.findByText(/^Edit made on /)
    expect(edited.textContent).not.toContain(', by ')
    expect(screen.queryByText('Subject line:')).toBeNull()
  })

  it('shows the error when the version cannot be loaded', async () => {
    getPreviousTemplateVersionMock.mockRejectedValue(
      new Error('No previous version of this template was found'),
    )

    render(<PreviousTemplateVersion template={template} />)

    await openModal()

    expect((await screen.findByRole('alert')).textContent).toContain(
      'No previous version of this template was found',
    )
  })

  it('loads again each time it is reopened', async () => {
    render(<PreviousTemplateVersion template={template} />)

    await openModal()
    await screen.findByRole('heading', { name: 'New Order Ready' })

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await openModal()

    expect(getPreviousTemplateVersionMock).toHaveBeenCalledTimes(2)
  })
})
