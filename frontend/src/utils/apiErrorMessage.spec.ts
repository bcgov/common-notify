import { describe, it, expect } from 'vitest'
import { getApiErrorMessage, getApiResponseMessage, toReadableError } from './apiErrorMessage'

/** An axios-shaped rejection. */
const httpError = (data?: unknown) =>
  Object.assign(new Error('Request failed with status code 400'), {
    response: { status: 400, data },
  })

describe('getApiResponseMessage', () => {
  it('returns a string message', () => {
    expect(getApiResponseMessage(httpError({ message: 'database is down' }))).toBe(
      'database is down',
    )
  })

  it('joins an array message', () => {
    expect(getApiResponseMessage(httpError({ message: ['name is required', 'bad email'] }))).toBe(
      'name is required, bad email',
    )
  })

  const validationBody = { message: 'Validation failed', errors: ['name is required', 'bad email'] }

  it("returns ValidationExceptionFilter's generic message by default", () => {
    expect(getApiResponseMessage(httpError(validationBody))).toBe('Validation failed')
  })

  it('falls back to errors without a message by default', () => {
    expect(getApiResponseMessage(httpError({ errors: ['bad email'] }))).toBe('bad email')
  })

  it('prefers errors over the generic message when asked', () => {
    expect(getApiResponseMessage(httpError(validationBody), { detailedErrors: true })).toBe(
      'name is required; bad email',
    )
  })

  it('ignores an empty errors array when preferring errors', () => {
    expect(
      getApiResponseMessage(httpError({ message: 'Validation failed', errors: [] }), {
        detailedErrors: true,
      }),
    ).toBe('Validation failed')
  })

  it.each([
    ['no response', new Error('Network Error')],
    ['no body', httpError()],
    ['a non-object body', httpError('<html>Bad Gateway</html>')],
    ['an empty message', httpError({ message: '' })],
    ['a non-error value', 'boom'],
    ['undefined', undefined],
    ['null', null],
  ])('returns undefined for %s', (_, err) => {
    expect(getApiResponseMessage(err)).toBeUndefined()
  })
})

describe('getApiErrorMessage', () => {
  it("returns the backend's message", () => {
    expect(getApiErrorMessage(httpError({ message: 'database is down' }))).toBe('database is down')
  })

  it("falls back to the error's own message", () => {
    expect(getApiErrorMessage(new Error('Network Error'))).toBe('Network Error')
  })

  it('falls back to the supplied default for a non-error', () => {
    expect(getApiErrorMessage('boom', 'Failed to load')).toBe('Failed to load')
  })

  it("defaults to 'Unknown error'", () => {
    expect(getApiErrorMessage(undefined)).toBe('Unknown error')
    expect(getApiErrorMessage(new Error(''))).toBe('Unknown error')
  })
})

describe('toReadableError', () => {
  const failed = (status: number, message = 'Server message') => ({
    response: { status, data: { message } },
  })

  it.each([401, 403])('reports %i as a permission problem', (status) => {
    expect(toReadableError(failed(status), 'usage').message).toBe(
      'You do not have permission to access usage',
    )
  })

  it('reports 404 as not found only for a single record, keeping the gateway message otherwise', () => {
    expect(toReadableError(failed(404), 'notification', { notFound: true }).message).toBe(
      'The notification could not be found',
    )
    expect(
      toReadableError(failed(404, 'no Route matched with those values'), 'notifications').message,
    ).toBe('Failed to load notifications: no Route matched with those values')
  })

  it("passes on the server's message, else the error's own", () => {
    expect(toReadableError(failed(500, 'database is down'), 'usage').message).toBe(
      'Failed to load usage: database is down',
    )
    expect(toReadableError(new Error('Network Error'), 'usage').message).toBe(
      'Failed to load usage: Network Error',
    )
  })
})
