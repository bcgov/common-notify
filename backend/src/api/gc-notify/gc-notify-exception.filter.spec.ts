import { ArgumentsHost, BadRequestException, NotFoundException } from '@nestjs/common'
import { describe, it, expect, vi } from 'vitest'
import { GcNotifyExceptionFilter } from './gc-notify-exception.filter'

function buildHost(jsonSpy: ReturnType<typeof vi.fn>): ArgumentsHost {
  const response = {
    status: vi.fn().mockReturnValue({ json: jsonSpy }),
  }
  return {
    switchToHttp: () => ({
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost
}

describe('GcNotifyExceptionFilter', () => {
  const filter = new GcNotifyExceptionFilter()

  it('reshapes a 400 BadRequestException with a plain message into ValidationErrorResponse shape', () => {
    const json = vi.fn()
    const host = buildHost(json)

    filter.catch(new BadRequestException('Invalid template_id'), host)

    expect(json).toHaveBeenCalledWith({
      status_code: 400,
      errors: [{ error: 'ValidationError', message: 'Invalid template_id' }],
    })
  })

  it('passes through an already GC Notify-shaped error body unchanged', () => {
    const json = vi.fn()
    const host = buildHost(json)

    filter.catch(
      new BadRequestException({
        errors: [{ error: 'ValidationError', message: 'Template not found' }],
      }),
      host,
    )

    expect(json).toHaveBeenCalledWith({
      status_code: 400,
      errors: [{ error: 'ValidationError', message: 'Template not found' }],
    })
  })

  it('reshapes a 404 NotFoundException into the result/message Error shape', () => {
    const json = vi.fn()
    const host = buildHost(json)

    filter.catch(new NotFoundException('Notification not found in database'), host)

    expect(json).toHaveBeenCalledWith({
      result: 'error',
      message: 'Notification not found in database',
    })
  })
})
