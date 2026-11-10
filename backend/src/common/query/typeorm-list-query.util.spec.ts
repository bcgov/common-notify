import { describe, expect, it, vi } from 'vitest'
import type { SelectQueryBuilder } from 'typeorm'
import {
  andWhereContains,
  andWhereJsonbHasAny,
  applyListQueryFilters,
  applyParsedListQueryToQueryBuilder,
} from './typeorm-list-query.util'
import { fakeQueryBuilder } from './test-utils/fake-query-builder'
import type { ParsedListQuery, QueryableFieldsConfig } from './list-query.types'

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
}

const createQueryBuilder = () => ({
  andWhere: vi.fn().mockReturnThis(),
  addOrderBy: vi.fn().mockReturnThis(),
  skip: vi.fn().mockReturnThis(),
  take: vi.fn().mockReturnThis(),
})

describe('applyParsedListQueryToQueryBuilder', () => {
  it('applies every supported operator, sort, and pagination', () => {
    const qb = createQueryBuilder()
    const parsedQuery: ParsedListQuery = {
      page: 2,
      limit: 25,
      skip: 25,
      filters: [
        { field: 'status', operator: 'eq', value: 'QUEUED' },
        { field: 'status', operator: 'ne', value: 'COMPLETED' },
        { field: 'status', operator: 'in', value: ['QUEUED', 'PROCESSING'] },
        { field: 'createdBy', operator: 'like', value: 'smith' },
        {
          field: 'createdAt',
          operator: 'gte',
          value: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          field: 'createdAt',
          operator: 'lte',
          value: new Date('2026-01-31T23:59:59.999Z'),
        },
        { field: 'channelCode', operator: 'isnull', value: null },
      ],
      sorts: [
        { field: 'createdAt', direction: 'DESC' },
        { field: 'status', direction: 'ASC' },
      ],
    }

    const result = applyParsedListQueryToQueryBuilder(qb as any, parsedQuery, queryConfig)

    expect(qb.andWhere).toHaveBeenNthCalledWith(1, 'LOWER(notification.status) = :filter_0', {
      filter_0: 'queued',
    })
    expect(qb.andWhere).toHaveBeenNthCalledWith(2, 'LOWER(notification.status) != :filter_1', {
      filter_1: 'completed',
    })
    expect(qb.andWhere).toHaveBeenNthCalledWith(3, 'LOWER(notification.status) IN (:...filter_2)', {
      filter_2: ['queued', 'processing'],
    })
    expect(qb.andWhere).toHaveBeenNthCalledWith(
      4,
      "notification.createdBy ILIKE :filter_3 ESCAPE '\\'",
      {
        filter_3: '%smith%',
      },
    )
    expect(qb.andWhere).toHaveBeenNthCalledWith(5, 'notification.createdAt >= :filter_4', {
      filter_4: new Date('2026-01-01T00:00:00.000Z'),
    })
    expect(qb.andWhere).toHaveBeenNthCalledWith(6, 'notification.createdAt <= :filter_5', {
      filter_5: new Date('2026-01-31T23:59:59.999Z'),
    })
    expect(qb.andWhere).toHaveBeenNthCalledWith(7, 'notification.channelCode IS NULL')
    expect(qb.addOrderBy).toHaveBeenNthCalledWith(1, 'notification.createdAt', 'DESC')
    expect(qb.addOrderBy).toHaveBeenNthCalledWith(2, 'notification.status', 'ASC')
    expect(qb.skip).toHaveBeenCalledWith(25)
    expect(qb.take).toHaveBeenCalledWith(25)
    expect(result).toBe(qb)
  })

  it('escapes like patterns containing special characters', () => {
    const qb = createQueryBuilder()
    const parsedQuery: ParsedListQuery = {
      page: 1,
      limit: 10,
      skip: 0,
      filters: [{ field: 'createdBy', operator: 'like', value: '100%_\\ops' }],
      sorts: [],
    }

    applyParsedListQueryToQueryBuilder(qb as any, parsedQuery, queryConfig)

    expect(qb.andWhere).toHaveBeenCalledWith("notification.createdBy ILIKE :filter_0 ESCAPE '\\'", {
      filter_0: '%100\\%\\_\\\\ops%',
    })
  })
})

describe('applyListQueryFilters', () => {
  it('applies the filters without sorting or paging', () => {
    const qb = createQueryBuilder()

    const result = applyListQueryFilters(
      qb as any,
      [{ field: 'channelCode', operator: 'in', value: ['EMAIL', 'SMS'] }],
      queryConfig,
    )

    expect(qb.andWhere).toHaveBeenCalledWith('LOWER(notification.channelCode) IN (:...filter_0)', {
      filter_0: ['email', 'sms'],
    })
    expect(qb.addOrderBy).not.toHaveBeenCalled()
    expect(qb.skip).not.toHaveBeenCalled()
    expect(qb.take).not.toHaveBeenCalled()
    expect(result).toBe(qb)
  })
})

const builder = () => {
  const fake = fakeQueryBuilder()
  return { ...fake, qb: fake.qb as unknown as SelectQueryBuilder<object> }
}

describe('andWhereContains', () => {
  it('matches the trimmed term anywhere, case-insensitively, with LIKE wildcards escaped', () => {
    const { qb, where } = builder()
    andWhereContains(qb, 't.name', '  50%_off\\ ')

    expect(where).toEqual([
      [String.raw`t.name ILIKE :search ESCAPE '\'`, { search: String.raw`%50\%\_off\\%` }],
    ])
  })

  it('adds nothing for a blank term', () => {
    const { qb, where } = builder()
    andWhereContains(qb, 't.name', '   ')
    andWhereContains(qb, 't.name', undefined)
    expect(where).toEqual([])
  })
})

describe('andWhereJsonbHasAny', () => {
  it('matches rows whose array holds any of the values, and adds nothing for none', () => {
    const { qb, where } = builder()
    andWhereJsonbHasAny(qb, 'n.channel_codes', [], 'channels')
    andWhereJsonbHasAny(qb, 'n.channel_codes', ['EMAIL', 'SMS'], 'channels')

    expect(where).toEqual([
      [
        'jsonb_exists_any(n.channel_codes, ARRAY[:...channels]::text[])',
        { channels: ['EMAIL', 'SMS'] },
      ],
    ])
  })
})
