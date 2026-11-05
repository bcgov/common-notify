import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import EventsEmailPreview from './EventsEmailPreview'
import type { EventEmailSettings } from '@/api/events.api'
import type { TemplateResponse } from '@/api/templates.api'

// The header reads the store; it has its own spec.
vi.mock('./EventsEmailHeader', () => ({ default: () => <div>Email header</div> }))

const emailSettings = { senderEmail: 'permits@gov.bc.ca' } as EventEmailSettings
const template = { subject: 'Permit for {{name}}', body: 'Hello {{name}}' } as TemplateResponse

describe('EventsEmailPreview', () => {
  it('shows the template as written when nothing has been rendered', () => {
    render(<EventsEmailPreview emailSettings={emailSettings} template={template} />)

    expect(screen.getByText('Permit for {{name}}')).toBeVisible()
    expect(screen.getByText('Hello {{name}}')).toBeVisible()
    expect(screen.getByText('Email header')).toBeVisible()
    expect(screen.queryByText('From:')).not.toBeInTheDocument()
  })

  it('shows the rendered text when there is no HTML', () => {
    render(
      <EventsEmailPreview
        emailSettings={emailSettings}
        template={template}
        rendered={{ subject: 'Permit for Alice', bodyText: 'Hello Alice' }}
      />,
    )

    expect(screen.getByText('Permit for Alice')).toBeVisible()
    expect(screen.getByText('Hello Alice')).toBeVisible()
    expect(screen.queryByTitle('Rendered email')).not.toBeInTheDocument()
  })

  it('frames the rendered HTML', () => {
    render(
      <EventsEmailPreview
        emailSettings={emailSettings}
        template={template}
        rendered={{ subject: 'Permit', bodyText: 'Hello Alice', bodyHtml: '<p>Hello Alice</p>' }}
      />,
    )

    expect(screen.getByTitle('Rendered email')).toBeInTheDocument()
  })

  it('shows the envelope lines when given', () => {
    render(
      <EventsEmailPreview
        emailSettings={emailSettings}
        template={template}
        envelope={{ from: 'permits@gov.bc.ca', to: 'alice@example.com' }}
      />,
    )

    expect(screen.getByText('permits@gov.bc.ca')).toBeVisible()
    expect(screen.getByText('alice@example.com')).toBeVisible()
  })
})
