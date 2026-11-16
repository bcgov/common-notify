import type { EntityManager } from 'typeorm'
import { vi } from 'vitest'
import { TenantLimit } from './entities/tenant-limit.entity'
import { TenantLimitAlert } from './entities/tenant-limit-alert.entity'
import { seedTenantLimitDefaults } from './tenant-limit-defaults'

/** An `insert().into().values().orIgnore().execute()` chain that records each insert. */
const insertRecorder = () => {
  const inserts: Array<{ entity: unknown; rows: unknown; orIgnore: boolean }> = []
  const manager = {
    createQueryBuilder: () => {
      const insert = { entity: undefined as unknown, rows: undefined as unknown, orIgnore: false }
      const chain = {
        insert: () => chain,
        into: (entity: unknown) => {
          insert.entity = entity
          return chain
        },
        values: (rows: unknown) => {
          insert.rows = rows
          return chain
        },
        orIgnore: () => {
          insert.orIgnore = true
          return chain
        },
        execute: vi.fn(() => {
          inserts.push(insert)
          return Promise.resolve(undefined)
        }),
      }
      return chain
    },
  }
  return { manager: manager as unknown as EntityManager, inserts }
}

describe('seedTenantLimitDefaults', () => {
  it('gives the tenant the default limits and an 80% warning on email and SMS', async () => {
    const { manager, inserts } = insertRecorder()

    await seedTenantLimitDefaults(manager, 'tenant-1')

    expect(inserts).toEqual([
      {
        entity: TenantLimit,
        orIgnore: true,
        rows: [
          expect.objectContaining({
            tenantId: 'tenant-1',
            channelCode: 'EMAIL',
            dailyLimit: 100_000,
            annualLimit: 20_000_000,
          }),
          expect.objectContaining({
            tenantId: 'tenant-1',
            channelCode: 'SMS',
            dailyLimit: 10_000,
            annualLimit: 100_000,
          }),
        ],
      },
      {
        entity: TenantLimitAlert,
        orIgnore: true,
        rows: [
          expect.objectContaining({
            tenantId: 'tenant-1',
            channelCode: 'EMAIL',
            warnThresholdPercent: 80,
          }),
          expect.objectContaining({
            tenantId: 'tenant-1',
            channelCode: 'SMS',
            warnThresholdPercent: 80,
          }),
        ],
      },
    ])
  })
})
