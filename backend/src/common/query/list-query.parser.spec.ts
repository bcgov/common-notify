import { BadRequestException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { parseListQuery } from './list-query.parser'
import type { QueryableFieldsConfig } from './list-query.types'

const queryConfig: QueryableFieldsConfig = {
  sortableFields: {
    createdAt: 'notification.createdAt',
    updatedAt: 'notification.updatedAt',
    status: 'notification.status',
  },
  filterableFields: {
    status: {
      column: 'notification.status',
      valueType: 'string',
      operators: ['eq', 'ne', 'in'],
    },
    channelCode: {
      column: 'notification.channelCode',
      valueType: 'string',
      operators: ['eq', 'in', 'isnull'],
    },
    createdAt: {
      column: 'notification.createdAt',
      valueType: 'date',
      operators: ['gte', 'lte'],
    },
    createdBy: {
      column: 'notification.createdBy',
      valueType: 'string',
      operators: ['eq', 'like', 'isnull'],
    },
  },
  defaultSort: [{ field: 'createdAt', direction: 'DESC' }],
}

describe('parseListQuery', () => {
  it('applies default pagination and sort when query parameters are missing', () => {
    const parsed = parseListQuery({}, queryConfig)

    expect(parsed).toEqual({
      page: 1,
      limit: 10,
      skip: 0,
      filters: [],
      sorts: [{ field: 'createdAt', direction: 'DESC' }],
    })
  })

  it('parses repeatable filters and multi-field sort expressions', () => {
    const parsed = parseListQuery(
      {
        page: '2',
        limit: '25',
        sort: '-createdAt,status',
        filter: [
          'status:eq:QUEUED',
          'status:in:QUEUED|PROCESSING|FAILED',
          'createdAt:gte:2026-01-01T00:00:00.000Z',
          'channelCode:isnull',
        ],
      },
      queryConfig,
    )

    expect(parsed.page).toBe(2)
    expect(parsed.limit).toBe(25)
    expect(parsed.skip).toBe(25)
    expect(parsed.sorts).toEqual([
      { field: 'createdAt', direction: 'DESC' },
      { field: 'status', direction: 'ASC' },
    ])
    expect(parsed.filters).toEqual([
      { field: 'status', operator: 'eq', value: 'QUEUED' },
      { field: 'status', operator: 'in', value: ['QUEUED', 'PROCESSING', 'FAILED'] },
      {
        field: 'createdAt',
        operator: 'gte',
        value: new Date('2026-01-01T00:00:00.000Z'),
      },
      { field: 'channelCode', operator: 'isnull', value: null },
    ])
  })

  it('throws for unsupported filter fields and operators', () => {
    expect(() => parseListQuery({ filter: ['priority:eq:HIGH'] }, queryConfig)).toThrow(
      BadRequestException,
    )
    expect(() => parseListQuery({ filter: ['status:like:queued'] }, queryConfig)).toThrow(
      "Unsupported operator 'like' for field 'status'",
    )
  })

  it('throws for invalid typed values and invalid sort fields', () => {
    expect(() => parseListQuery({ filter: ['createdAt:gte:not-a-date'] }, queryConfig)).toThrow(
      "Invalid date value: 'not-a-date'",
    )
    expect(() => parseListQuery({ sort: '-createdAt,priority' }, queryConfig)).toThrow(
      "Unsupported sort field 'priority'",
    )
  })

  it('throws when an in filter has no values', () => {
    expect(() => parseListQuery({ filter: ['status:in:'] }, queryConfig)).toThrow(
      "Filter 'status:in:' is missing a value",
    )
  })
})
