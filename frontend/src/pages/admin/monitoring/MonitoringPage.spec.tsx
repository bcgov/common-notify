import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MonitoringPage from './MonitoringPage'
import { BACKSTOP_INTERVAL_MS, FALLBACK_INTERVAL_MS } from './useMonitoringSnapshot'
import { connectQueueMonitoringStream, getQueueMonitoring } from '@/api/monitoring.api'
import type { QueueMonitoringStreamHandlers } from '@/api/monitoring.api'
import UserService from '@/service/user-service'
import { snapshot } from './monitoring.fixture'

vi.mock('@/api/monitoring.api', () => ({
  getQueueMonitoring: vi.fn(),
  connectQueueMonitoringStream: vi.fn(),
}))
vi.mock('@/service/user-service', () => ({ default: { hasRole: vi.fn(() => true) } }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))

const mockedGet = vi.mocked(getQueueMonitoring)
const mockedConnect = vi.mocked(connectQueueMonitoringStream)

/** The handlers the page passed to the most recently opened stream. */
let stream: QueueMonitoringStreamHandlers
let streamController: AbortController

/** The frame with a stand-in for a page's sections, so "loaded" is one recognisable line. */
function renderPage(page: 'overview' | 'system' = 'overview') {
  return render(
    <MonitoringPage page={page} title="Test page" meta="Read-only.">
      {(data) => <p>Snapshot taken {data.generatedAt}</p>}
    </MonitoringPage>,
  )
}
const loaded = () => screen.findByText(/^Snapshot taken/)

describe('MonitoringPage', () => {
  beforeEach(() => {
    vi.mocked(UserService.hasRole).mockReturnValue(true)
    mockedGet.mockReset()
    mockedConnect.mockReset().mockImplementation((handlers) => {
      stream = handlers
      streamController = new AbortController()
      return streamController
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows overall health and the backlog beside the heading', async () => {
    mockedGet.mockResolvedValue(snapshot())
    renderPage()

    await loaded()
    expect(screen.getByRole('heading', { level: 1, name: 'Test page' })).toBeInTheDocument()
    expect(screen.getByText('Healthy')).toBeInTheDocument()
    expect(screen.getByText('63 messages pending')).toBeInTheDocument()
    expect(screen.getByText('Clears in ~3 min')).toBeInTheDocument()
  })

  it('shows no warnings banner when nothing needs attention', async () => {
    mockedGet.mockResolvedValue(snapshot())
    renderPage()

    await loaded()
    expect(screen.queryByText(/warnings?$/)).not.toBeInTheDocument()
  })

  describe('with warnings on more than one page', () => {
    function degraded() {
      const data = snapshot({ status: 'critical' })
      data.redis = { ...data.redis, status: 'warning', reasons: ['Memory is 91% of its cap'] }
      data.queues[0] = {
        ...data.queues[0],
        status: 'critical',
        reasons: ['Jobs are waiting but no pod is processing this queue'],
      }
      return data
    }

    it('lists every warning, and links to the page with each one’s details', async () => {
      mockedGet.mockResolvedValue(degraded())
      renderPage()

      const banner = within(
        (await screen.findByText('2 warnings')).closest('.alert') as HTMLElement,
      )
      expect(banner.getByText('Redis: Memory is 91% of its cap')).toBeInTheDocument()
      expect(
        banner.getByText('Email delivery: Jobs are waiting but no pod is processing this queue'),
      ).toBeInTheDocument()
      expect(banner.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
        '/admin/monitoring',
      ])
      expect(banner.getByRole('link', { name: 'View System' })).toBeInTheDocument()
    })

    it('does not link to the page the reader is already on', async () => {
      mockedGet.mockResolvedValue(degraded())
      renderPage('system')

      await screen.findByText('2 warnings')
      expect(screen.queryByRole('link', { name: 'View System' })).not.toBeInTheDocument()
    })
  })

  it('shows a loading message until the first snapshot arrives', () => {
    mockedGet.mockReturnValue(new Promise(() => {}))
    renderPage()

    expect(screen.getByText('Loading monitoring data…')).toBeInTheDocument()
  })

  it('shows the error when the first load fails', async () => {
    mockedGet.mockRejectedValue(
      new Error('Failed to load queue monitoring: Redis is not configured'),
    )
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Redis is not configured')
    expect(screen.queryByText(/^Snapshot taken/)).not.toBeInTheDocument()
  })

  it('keeps the last snapshot on screen when a refresh fails', async () => {
    const user = userEvent.setup()
    mockedGet.mockResolvedValueOnce(snapshot()).mockRejectedValueOnce(new Error('Network Error'))
    renderPage()

    await loaded()
    await user.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Network Error Showing the last successful snapshot.',
    )
    expect(screen.getByText(/^Snapshot taken/)).toBeInTheDocument()
  })

  it('announces a change in overall health but not an unchanged refresh', async () => {
    const user = userEvent.setup()
    mockedGet
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(snapshot({ status: 'warning' }))
    renderPage()
    await loaded()

    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(screen.queryByText(/Overall health changed/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(await screen.findByText('Overall health changed to Warning')).toBeInTheDocument()
  })

  it('refetches when the stream signals a change', async () => {
    mockedGet.mockResolvedValue(snapshot())
    renderPage()
    await loaded()
    act(() => stream.onOpen())
    expect(screen.getByText('Live')).toBeInTheDocument()
    expect(mockedGet).toHaveBeenCalledTimes(1)

    mockedGet.mockResolvedValue(snapshot({ status: 'warning' }))
    act(() => stream.onChange())

    expect(await screen.findByText('Overall health changed to Warning')).toBeInTheDocument()
    expect(mockedGet).toHaveBeenCalledTimes(2)
  })

  it('hides Refresh while the stream is live and brings it back when it drops', async () => {
    mockedGet.mockResolvedValue(snapshot())
    renderPage()
    await loaded()

    act(() => stream.onOpen())
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument()

    act(() => stream.onError(false))
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
  })

  it('polls slowly while live and falls back to faster polling when the stream drops', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockedGet.mockResolvedValue(snapshot())
    renderPage()
    await loaded()
    act(() => stream.onOpen())

    await act(() => vi.advanceTimersByTimeAsync(FALLBACK_INTERVAL_MS))
    expect(mockedGet).toHaveBeenCalledTimes(1)
    await act(() => vi.advanceTimersByTimeAsync(BACKSTOP_INTERVAL_MS - FALLBACK_INTERVAL_MS))
    expect(mockedGet).toHaveBeenCalledTimes(2)

    act(() => stream.onError(false))
    expect(screen.getByText(/Reconnecting/)).toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(FALLBACK_INTERVAL_MS))
    expect(mockedGet).toHaveBeenCalledTimes(3)
  })

  it('catches up once when the stream reconnects', async () => {
    mockedGet.mockResolvedValue(snapshot())
    renderPage()
    await loaded()
    act(() => stream.onOpen())
    act(() => stream.onError(false))

    act(() => stream.onOpen())

    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2))
  })

  it('says when live updates are refused, and keeps polling', async () => {
    mockedGet.mockResolvedValue(snapshot())
    renderPage()
    await loaded()

    act(() => stream.onError(true))

    expect(screen.getByText(/Live updates unavailable/)).toBeInTheDocument()
  })

  it('closes the stream and stops polling when live updates are turned off', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockedGet.mockResolvedValue(snapshot())
    renderPage()
    await loaded()
    const opened = streamController

    await user.click(screen.getByRole('switch', { name: 'Live updates' }))

    expect(opened.signal.aborted).toBe(true)
    expect(screen.getByText('Paused')).toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(BACKSTOP_INTERVAL_MS * 2))
    expect(mockedGet).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(mockedGet).toHaveBeenCalledTimes(2)
  })

  it('is not available to users without the NOTIFY_ADMIN role, and never calls the API', () => {
    vi.mocked(UserService.hasRole).mockReturnValue(false)
    renderPage()

    expect(screen.queryByRole('heading', { name: 'Test page' })).not.toBeInTheDocument()
    expect(mockedGet).not.toHaveBeenCalled()
    expect(mockedConnect).not.toHaveBeenCalled()
  })
})
