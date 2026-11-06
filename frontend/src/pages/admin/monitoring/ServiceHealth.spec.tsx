import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { getQueueMonitoring } from '@/api/monitoring.api'
import { MB, snapshot } from './monitoring.fixture'

vi.mock('@/api/monitoring.api', () => ({
  getQueueMonitoring: vi.fn(),
  connectQueueMonitoringStream: vi.fn(() => new AbortController()),
}))
vi.mock('@/service/user-service', () => ({ default: { hasRole: vi.fn(() => true) } }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))

const mockedGet = vi.mocked(getQueueMonitoring)
import ServiceHealth from './ServiceHealth'

describe('ServiceHealth', () => {
  beforeEach(() => mockedGet.mockReset())

  it('shows each provider sending normally, with CHES requests in flight', async () => {
    mockedGet.mockResolvedValue(snapshot())
    render(<ServiceHealth />)

    expect(await screen.findByText('CHES (Email)')).toBeInTheDocument()
    expect(screen.getByText('ACS (SMS)')).toBeInTheDocument()
    expect(screen.getAllByText('Sending')).toHaveLength(2)
    expect(screen.getByText('3 of 5')).toBeInTheDocument()
    // ACS has no concurrency cap, so no in-flight tile.
    expect(screen.getAllByText('Requests in flight')).toHaveLength(1)
  })

  it('raises a paused provider in the banner and in its card', async () => {
    const data = snapshot()
    data.providers = [
      data.providers[0],
      {
        ...data.providers[1],
        status: 'warning',
        reasons: ['Failing; sends are waiting, and resume once a test send succeeds'],
        circuit: 'open',
        reopensAt: '2026-10-01T18:00:30.000Z',
      },
    ]
    mockedGet.mockResolvedValue(data)
    render(<ServiceHealth />)

    expect(
      await screen.findByText(
        'ACS (SMS): Failing; sends are waiting, and resume once a test send succeeds',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Paused: provider failing')).toBeInTheDocument()
    expect(screen.getByText(/^Test send at /)).toBeInTheDocument()
    // The details are on this page, so the banner doesn't link to it.
    expect(screen.queryByRole('link', { name: 'View Service health' })).not.toBeInTheDocument()
  })

  it('shows Redis details', async () => {
    mockedGet.mockResolvedValue(snapshot())
    render(<ServiceHealth />)

    expect(await screen.findByText('noeviction')).toBeInTheDocument()
    expect(screen.getByText('4 idle workers listening')).toBeInTheDocument()
  })

  it('hides fragmentation at low memory use and flags it when high on a busy instance', async () => {
    mockedGet.mockResolvedValue(snapshot())
    const { unmount } = render(<ServiceHealth />)
    // 300 MB used in the default snapshot: meaningful, and 1.12 is normal.
    expect(await screen.findByText('1.12')).toBeInTheDocument()
    unmount()

    const small = snapshot()
    small.redis = { ...small.redis, usedMemoryBytes: 45 * MB, fragmentationRatio: 2.76 }
    mockedGet.mockResolvedValue(small)
    const second = render(<ServiceHealth />)
    expect(await screen.findByText('Not meaningful at low memory use')).toBeInTheDocument()
    expect(screen.queryByText('2.76')).not.toBeInTheDocument()
    second.unmount()

    const fragmented = snapshot()
    fragmented.redis = { ...fragmented.redis, fragmentationRatio: 2.4 }
    mockedGet.mockResolvedValue(fragmented)
    render(<ServiceHealth />)
    expect(await screen.findByText('2.40')).toBeInTheDocument()
    expect(
      screen.getByText('High: Redis holds more memory than its data needs'),
    ).toBeInTheDocument()
  })
})
