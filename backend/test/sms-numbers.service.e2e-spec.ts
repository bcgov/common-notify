import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { DataSource } from 'typeorm'
import { SmsNumbersService } from '../src/api/sms-numbers/sms-numbers.service'
import { SmsNumberRequestHandler } from '../src/api/sms-numbers/sms-number-request.handler'
import { SmsNumber } from '../src/api/sms-numbers/entities/sms-number.entity'
import { TenantSmsNumber } from '../src/api/sms-numbers/entities/tenant-sms-number.entity'
import { TenantRequestsService } from '../src/api/tenant-requests/tenant-requests.service'
import { TenantRequestHandlerRegistry } from '../src/api/tenant-requests/tenant-request-handler.registry'
import { TenantRequest } from '../src/api/tenant-requests/entities/tenant-request.entity'
import { TenantRequestHistory } from '../src/api/tenant-requests/entities/tenant-request-history.entity'
import type { ISmsTransport } from '../src/adapters'

/**
 * SMS numbers, assignments and requests against a real Postgres, on the schema the tenant requests
 * and SMS numbers migrations create: the per-provider assignment rule and the one-pending-request
 * rule are constraints, so only the database can show they hold.
 *
 * Needs Postgres (localhost:5432, user postgres, password default; override POSTGRES_PORT).
 * Builds its own database so a developer's migrated dev schema is never touched.
 */
const PORT = Number(process.env.POSTGRES_PORT ?? 5432)
const TEST_DB = 'notify_sms_numbers_e2e'
const base = {
  type: 'postgres' as const,
  host: 'localhost',
  port: PORT,
  username: 'postgres',
  password: 'default',
}

/**
 * A migration, found by name rather than version: a version can be renumbered to land after
 * another branch's migration.
 */
function migration(name: string): string {
  const dir = join(__dirname, '../../migrations/sql')
  const [file] = readdirSync(dir).filter((entry) =>
    new RegExp(`^V\\d+__${name}\\.sql$`).test(entry),
  )
  if (!file) throw new Error(`No V*__${name}.sql migration in ${dir}`)
  return readFileSync(join(dir, file), 'utf8')
}

const PARKS = '7f1d5c9e-0000-4000-8000-0000000000a1'
const ROADS = '7f1d5c9e-0000-4000-8000-0000000000a2'
const LANDS = '7f1d5c9e-0000-4000-8000-0000000000a3'
const admin = { id: 'padmin', name: 'Pat Admin' }
const tenantUser = { id: 'tuser', name: 'Terry User' }
/** What config says; flipped per test to stand in for prod. */
const config: Record<string, unknown> = {
  'defaults.sms.fromNumber': '+15550009999',
  'smsNumbers.defaultNumberAssignable': true,
}

describe('SMS numbers (database)', () => {
  let dataSource: DataSource
  let numbers: SmsNumbersService
  let requests: TenantRequestsService
  let handler: SmsNumberRequestHandler

  const addNumber = (phoneNumber: string, providerCode = 'aws') =>
    numbers.createNumber({ phoneNumber, providerCode, numberTypeCode: 'long_code' }, admin)

  beforeAll(async () => {
    const root = new DataSource({ ...base, database: 'postgres' })
    await root.initialize()
    await root.query(`DROP DATABASE IF EXISTS ${TEST_DB}`)
    await root.query(`CREATE DATABASE ${TEST_DB}`)
    await root.destroy()

    dataSource = new DataSource({
      ...base,
      database: TEST_DB,
      entities: [SmsNumber, TenantSmsNumber, TenantRequest, TenantRequestHistory],
      synchronize: false,
    })
    await dataSource.initialize()
    // Only the tenant columns the migrations and these services touch.
    await dataSource.query(`
      CREATE SCHEMA notify;
      CREATE TABLE notify.tenant (
        id UUID PRIMARY KEY, name VARCHAR(200) NOT NULL, is_deleted BOOLEAN NOT NULL DEFAULT FALSE
      );`)
    await dataSource.query(migration('tenant_requests'))
    await dataSource.query(migration('sms_numbers'))
    await dataSource.query(
      `INSERT INTO notify.tenant (id, name) VALUES ($1, 'Parks'), ($2, 'Roads'), ($3, '100% Parks')`,
      [PARKS, ROADS, LANDS],
    )

    const registry = new TenantRequestHandlerRegistry()
    requests = new TenantRequestsService(dataSource.getRepository(TenantRequest), registry)
    numbers = new SmsNumbersService(
      dataSource.getRepository(SmsNumber),
      dataSource.getRepository(TenantSmsNumber),
      requests,
      { name: 'aws' } as ISmsTransport,
      { get: (key: string) => config[key] } as unknown as ConfigService,
    )
    handler = new SmsNumberRequestHandler(registry, numbers)
    handler.onModuleInit()
  })

  afterAll(async () => {
    await dataSource?.destroy()
  })

  beforeEach(async () => {
    config['smsNumbers.defaultNumberAssignable'] = true
    await dataSource.query(
      `TRUNCATE notify.tenant_request_history, notify.tenant_request_sms_number,
                notify.tenant_request, notify.tenant_sms_number, notify.sms_number`,
    )
  })

  describe('numbers and assignments', () => {
    it('sends from the number assigned for the provider asked about, and no other', async () => {
      const aws = await addNumber('+15814360804', 'aws')
      const twilio = await addNumber('+15551230000', 'twilio')
      await numbers.assign(PARKS, aws.id, admin)
      await numbers.assign(PARKS, twilio.id, admin)

      await expect(numbers.getFromNumber(PARKS, 'aws')).resolves.toBe('+15814360804')
      await expect(numbers.getFromNumber(PARKS, 'twilio')).resolves.toBe('+15551230000')
      await expect(numbers.getFromNumber(PARKS, 'acs')).resolves.toBeNull()
      await expect(numbers.getFromNumber(ROADS, 'aws')).resolves.toBeNull()
    })

    it("replaces the tenant's number for that provider rather than adding a second", async () => {
      const first = await addNumber('+15814360804')
      const second = await addNumber('+15814360805')
      await numbers.assign(PARKS, first.id, admin)

      await numbers.assign(PARKS, second.id, admin)

      await expect(numbers.getFromNumber(PARKS, 'aws')).resolves.toBe('+15814360805')
      await expect(dataSource.getRepository(TenantSmsNumber).count()).resolves.toBe(1)
    })

    it('lets one number serve several tenants, and lists them against it', async () => {
      const shortCode = await numbers.createNumber(
        { phoneNumber: '12345', providerCode: 'aws', numberTypeCode: 'short_code' },
        admin,
      )
      await numbers.assign(PARKS, shortCode.id, admin)
      await numbers.assign(ROADS, shortCode.id, admin)

      const [listed] = await numbers.listNumbers()

      expect(listed).toMatchObject({ phoneNumber: '12345', numberTypeCode: 'short_code' })
      expect(listed.tenants).toEqual([
        { tenantId: PARKS, tenantName: 'Parks' },
        { tenantId: ROADS, tenantName: 'Roads' },
      ])
    })

    it('refuses a number already listed for that provider, but allows it for another', async () => {
      await addNumber('+15814360804', 'aws')

      await expect(addNumber('+15814360804', 'aws')).rejects.toBeInstanceOf(ConflictException)
      await expect(addNumber('+15814360804', 'twilio')).resolves.toMatchObject({
        providerCode: 'twilio',
      })
    })

    it('will not delete an assigned number until it is unassigned', async () => {
      const number = await addNumber('+15814360804')
      await numbers.assign(PARKS, number.id, admin)

      await expect(numbers.deleteNumber(number.id, admin)).rejects.toBeInstanceOf(ConflictException)

      await numbers.unassign(PARKS, number.id, admin)
      await numbers.deleteNumber(number.id, admin)
      await expect(numbers.listNumbers()).resolves.toEqual([])
      // Deleted numbers can be listed again, as a fresh row.
      await expect(addNumber('+15814360804')).resolves.toBeDefined()
    })

    it("holds an assignment's provider to its number's", async () => {
      const number = await addNumber('+15814360804', 'aws')

      await expect(
        dataSource.query(
          `INSERT INTO notify.tenant_sms_number (tenant_id, sms_number_id, provider_code)
           VALUES ($1, $2, 'twilio')`,
          [PARKS, number.id],
        ),
      ).rejects.toThrow(/fk_tenant_sms_number_number/)
    })

    it('rejects assigning a missing number or tenant', async () => {
      const number = await addNumber('+15814360804')

      await expect(
        numbers.assign(PARKS, '7f1d5c9e-0000-4000-8000-0000000000ff', admin),
      ).rejects.toBeInstanceOf(NotFoundException)
      await expect(
        numbers.assign('7f1d5c9e-0000-4000-8000-0000000000ff', number.id, admin),
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it("falls back to the provider's default number, then to the environment variable", async () => {
      const awsDefault = await addNumber('+15814360804', 'aws')
      const own = await addNumber('+15814360805', 'aws')
      await expect(numbers.getFromNumber(PARKS, 'aws')).resolves.toBeNull()
      await expect(numbers.getCodes()).resolves.toMatchObject({ defaultNumber: '+15550009999' })

      await numbers.setDefault(awsDefault.id, admin)
      await numbers.assign(PARKS, own.id, admin)

      // A tenant's own number wins; one without falls to the provider's default.
      await expect(numbers.getFromNumber(PARKS, 'aws')).resolves.toBe('+15814360805')
      await expect(numbers.getFromNumber(ROADS, 'aws')).resolves.toBe('+15814360804')
      // The default is per provider: Twilio has none.
      await expect(numbers.getFromNumber(ROADS, 'twilio')).resolves.toBeNull()
      await expect(numbers.getCodes()).resolves.toMatchObject({ defaultNumber: '+15814360804' })
    })

    it('keeps one default per provider, replacing the previous one', async () => {
      const first = await addNumber('+15814360804', 'aws')
      const second = await addNumber('+15814360805', 'aws')
      const twilio = await addNumber('+15551230000', 'twilio')
      await numbers.setDefault(first.id, admin)
      await numbers.setDefault(twilio.id, admin)

      await numbers.setDefault(second.id, admin)

      const defaults = (await numbers.listNumbers())
        .filter((number) => number.isDefault)
        .map((number) => number.phoneNumber)
      expect(defaults.sort()).toEqual(['+15551230000', '+15814360805'])
      await expect(
        dataSource.query(`UPDATE notify.sms_number SET is_default = TRUE WHERE id = $1`, [
          first.id,
        ]),
      ).rejects.toThrow(/uq_sms_number_provider_default/)
    })

    it('will not delete the default until it stops being the default', async () => {
      const number = await addNumber('+15814360804')
      await numbers.setDefault(number.id, admin)

      await expect(numbers.deleteNumber(number.id, admin)).rejects.toBeInstanceOf(ConflictException)

      await expect(numbers.clearDefault(number.id, admin)).resolves.toMatchObject({
        isDefault: false,
      })
      await numbers.deleteNumber(number.id, admin)
      await expect(numbers.getFromNumber(ROADS, 'aws')).resolves.toBeNull()
    })

    it('lists the code tables and the active provider', async () => {
      const codes = await numbers.getCodes()

      expect(codes.providers.map((p) => p.code)).toEqual(['acs', 'aws', 'swift', 'twilio'])
      await expect(requests.getCodes()).resolves.toEqual({
        types: [{ code: 'sms_number', description: 'SMS number' }],
        statuses: expect.arrayContaining([expect.objectContaining({ code: 'released' })]),
      })
      expect(codes.numberTypes.map((t) => t.code)).toContain('rcs')
      expect(codes.activeProvider).toBe('aws')
    })
  })

  describe('requests', () => {
    const ask = (tenantId: string) => requests.create(tenantId, 'sms_number', tenantUser)
    /** Approves on a number from the inventory, or with null, on the default number. */
    const approve = (requestId: string, smsNumberId: string | null) =>
      requests.approve(
        requestId,
        smsNumberId === null ? { useDefaultNumber: true } : { smsNumberId },
        admin,
      )
    const historyOf = (requestId: string) =>
      dataSource
        .getRepository(TenantRequestHistory)
        .find({ where: { tenantRequestId: requestId }, order: { createdAt: 'ASC' } })

    it('allows one pending request per tenant', async () => {
      const request = await ask(PARKS)

      expect(request).toMatchObject({
        tenantName: 'Parks',
        requestTypeCode: 'sms_number',
        statusCode: 'pending',
        requestedBy: 'Terry User',
        decidedAt: null,
        outcome: null,
      })
      await expect(ask(PARKS)).rejects.toBeInstanceOf(ConflictException)
      await expect(ask(ROADS)).resolves.toBeDefined()
    })

    it('refuses a request type nothing handles', async () => {
      await expect(requests.create(PARKS, 'priority_lane', tenantUser)).rejects.toBeInstanceOf(
        BadRequestException,
      )
    })

    it('approves by assigning the number, recording who decided and what was granted', async () => {
      const number = await addNumber('+15814360804')
      const request = await ask(PARKS)

      const approved = await approve(request.id, number.id)

      expect(approved).toMatchObject({
        statusCode: 'approved',
        outcome: '+15814360804',
        decidedBy: 'Pat Admin',
      })
      expect(approved.decidedAt).not.toBeNull()
      await expect(numbers.getFromNumber(PARKS, 'aws')).resolves.toBe('+15814360804')
      await expect(handler.toSmsDto(dataSource.manager, approved)).resolves.toMatchObject({
        phoneNumber: '+15814360804',
        usesDefaultNumber: false,
      })
    })

    it('leaves the request pending if the number cannot be assigned or is not chosen', async () => {
      const request = await ask(PARKS)

      await expect(
        approve(request.id, '7f1d5c9e-0000-4000-8000-0000000000ff'),
      ).rejects.toBeInstanceOf(NotFoundException)
      await expect(requests.approve(request.id, {}, admin)).rejects.toBeInstanceOf(
        BadRequestException,
      )
      await expect(
        requests.approve(request.id, { smsNumberId: 'not-a-uuid' }, admin),
      ).rejects.toBeInstanceOf(BadRequestException)

      await expect(requests.findLatestForTenant(PARKS, 'sms_number')).resolves.toMatchObject({
        statusCode: 'pending',
      })
      await expect(
        dataSource.query('SELECT 1 FROM notify.tenant_request_sms_number'),
      ).resolves.toHaveLength(0)
    })

    it('rejects with a reason, and decides a request only once', async () => {
      const number = await addNumber('+15814360804')
      const request = await ask(PARKS)

      await expect(requests.reject(request.id, 'No use case given', admin)).resolves.toMatchObject({
        statusCode: 'rejected',
        decisionReason: 'No use case given',
        decidedBy: 'Pat Admin',
      })
      await expect(approve(request.id, number.id)).rejects.toBeInstanceOf(ConflictException)
      await expect(requests.release(request.id, admin)).rejects.toBeInstanceOf(ConflictException)
    })

    it('lets a tenant cancel its own pending request, recording who and when', async () => {
      const request = await ask(PARKS)

      await expect(requests.cancel(ROADS, request.id, tenantUser)).rejects.toBeInstanceOf(
        NotFoundException,
      )
      // Another type's endpoint cannot reach it either.
      await expect(
        requests.cancel(PARKS, request.id, tenantUser, 'priority_lane'),
      ).rejects.toBeInstanceOf(NotFoundException)
      const cancelled = await requests.cancel(PARKS, request.id, tenantUser, 'sms_number')

      expect(cancelled).toMatchObject({
        statusCode: 'cancelled',
        cancelledBy: 'Terry User',
        decidedAt: null,
      })
      expect(cancelled.cancelledAt).not.toBeNull()
      // Too late for an admin to decide it, and the tenant can ask again.
      await expect(requests.reject(request.id, 'Late', admin)).rejects.toBeInstanceOf(
        ConflictException,
      )
      await expect(ask(PARKS)).resolves.toMatchObject({ statusCode: 'pending' })
      expect(
        (await historyOf(request.id)).map((row) => [row.statusCode, row.createdByName]),
      ).toEqual([
        ['pending', 'Terry User'],
        ['cancelled', 'Terry User'],
      ])
    })

    it('cancels only a pending request', async () => {
      const number = await addNumber('+15814360804')
      const request = await ask(PARKS)
      await approve(request.id, number.id)

      await expect(requests.cancel(PARKS, request.id, tenantUser)).rejects.toBeInstanceOf(
        ConflictException,
      )
    })

    it('releases an approved number, by an admin or the tenant itself', async () => {
      const number = await addNumber('+15814360804')
      const request = await ask(PARKS)
      await approve(request.id, number.id)

      // Another tenant cannot see it, let alone release it.
      await expect(
        requests.release(request.id, tenantUser, { tenantId: ROADS, type: 'sms_number' }),
      ).rejects.toBeInstanceOf(NotFoundException)
      const released = await requests.release(request.id, tenantUser, {
        tenantId: PARKS,
        type: 'sms_number',
      })

      expect(released).toMatchObject({
        statusCode: 'released',
        releasedBy: 'Terry User',
        // The approval, and the number it gave, are still on record.
        decidedBy: 'Pat Admin',
        outcome: '+15814360804',
      })
      expect(released.releasedAt).not.toBeNull()
      await expect(numbers.getFromNumber(PARKS, 'aws')).resolves.toBeNull()
      await expect(requests.release(request.id, admin)).rejects.toBeInstanceOf(ConflictException)
      expect((await historyOf(request.id)).map((row) => row.statusCode)).toEqual([
        'pending',
        'approved',
        'released',
      ])
    })

    it('releases the request when an admin unassigns or replaces its number directly', async () => {
      const first = await addNumber('+15814360804')
      const second = await addNumber('+15814360805')
      const replaced = await ask(PARKS)
      await approve(replaced.id, first.id)
      const unassigned = await ask(ROADS)
      await approve(unassigned.id, first.id)

      await numbers.assign(PARKS, second.id, admin)
      await numbers.unassign(ROADS, first.id, admin)

      const byId = new Map((await requests.list()).data.map((r) => [r.id, r]))
      expect(byId.get(replaced.id)).toMatchObject({
        statusCode: 'released',
        releasedBy: 'Pat Admin',
      })
      expect(byId.get(unassigned.id)).toMatchObject({ statusCode: 'released' })
    })

    it('keeps who created the request, and who last changed it', async () => {
      const number = await addNumber('+15814360804')
      const request = await ask(PARKS)
      const auditOf = async () =>
        dataSource.getRepository(TenantRequest).findOneByOrFail({ id: request.id })

      await expect(auditOf()).resolves.toMatchObject({
        createdBy: 'tuser',
        createdByName: 'Terry User',
        updatedBy: 'tuser',
      })
      await approve(request.id, number.id)
      await expect(auditOf()).resolves.toMatchObject({ createdBy: 'tuser', updatedBy: 'padmin' })
      // Released by an admin unassigning the number, through the bulk update.
      await numbers.unassign(PARKS, number.id, { id: 'other-admin', name: null })
      await expect(auditOf()).resolves.toMatchObject({
        createdBy: 'tuser',
        updatedBy: 'other-admin',
        statusCode: 'released',
      })
    })

    it('records who moved a request into each status, and when, with the reason', async () => {
      const number = await addNumber('+15814360804')
      const approved = await ask(PARKS)
      await approve(approved.id, number.id)
      await numbers.unassign(PARKS, number.id, admin)
      const rejected = await ask(ROADS)
      await requests.reject(rejected.id, 'No opt-out steps', admin)

      const rows = async (requestId: string) =>
        (await historyOf(requestId)).map((row) => [row.statusCode, row.createdByName, row.reason])

      await expect(rows(approved.id)).resolves.toEqual([
        ['pending', 'Terry User', null],
        ['approved', 'Pat Admin', null],
        ['released', 'Pat Admin', null],
      ])
      await expect(rows(rejected.id)).resolves.toEqual([
        ['pending', 'Terry User', null],
        ['rejected', 'Pat Admin', 'No opt-out steps'],
      ])
    })

    it('approves on the default number outside prod, assigning nothing', async () => {
      const request = await ask(PARKS)

      const approved = await approve(request.id, null)

      expect(approved).toMatchObject({
        statusCode: 'approved',
        outcome: 'Default number',
        decidedBy: 'Pat Admin',
      })
      await expect(handler.toSmsDto(dataSource.manager, approved)).resolves.toMatchObject({
        usesDefaultNumber: true,
        phoneNumber: null,
      })
      await expect(dataSource.getRepository(TenantSmsNumber).count()).resolves.toBe(0)
      await expect(
        requests.release(request.id, tenantUser, { tenantId: PARKS, type: 'sms_number' }),
      ).resolves.toMatchObject({ statusCode: 'released', releasedBy: 'Terry User' })
      expect((await historyOf(request.id)).map((row) => row.statusCode)).toEqual([
        'pending',
        'approved',
        'released',
      ])
    })

    it('refuses the default number in prod, leaving the request pending', async () => {
      config['smsNumbers.defaultNumberAssignable'] = false
      const request = await ask(PARKS)

      await expect(approve(request.id, null)).rejects.toBeInstanceOf(BadRequestException)
      const latest = await requests.findLatestForTenant(PARKS, 'sms_number')
      expect(latest).toMatchObject({ statusCode: 'pending', outcome: null })
      await expect(handler.toSmsDto(dataSource.manager, latest)).resolves.toMatchObject({
        usesDefaultNumber: false,
      })
      await expect(numbers.getCodes()).resolves.toMatchObject({
        defaultNumber: '+15550009999',
        defaultNumberAssignable: false,
      })
    })

    it('pages, filters by status and type, and searches tenant names for the admin table', async () => {
      const parks = await ask(PARKS)
      await requests.reject(parks.id, 'No', admin)
      await ask(PARKS)
      await ask(ROADS)
      await ask(LANDS)

      // Newest first, two to a page.
      const first = await requests.list({ page: 1, limit: 2 })
      expect(first).toMatchObject({ count: 4, page: 1, limit: 2, totalPages: 2 })
      expect(first.data.map((r) => r.tenantName)).toEqual(['100% Parks', 'Roads'])
      expect((await requests.list({ page: 2, limit: 2 })).data).toHaveLength(2)

      // Several statuses, and none meaning all.
      await expect(requests.list({ statuses: ['rejected'] })).resolves.toMatchObject({ count: 1 })
      await expect(requests.list({ statuses: ['rejected', 'pending'] })).resolves.toMatchObject({
        count: 4,
      })
      await expect(requests.list({ statuses: [] })).resolves.toMatchObject({ count: 4 })
      // By type, the same way.
      await expect(requests.list({ types: ['sms_number'] })).resolves.toMatchObject({ count: 4 })
      await expect(requests.list({ types: ['priority_lane'] })).resolves.toMatchObject({
        count: 0,
      })

      // Case-insensitive, and a % in the search is a literal, not a wildcard.
      const parksOnly = await requests.list({ search: 'parks', statuses: ['pending'] })
      expect(parksOnly.data.map((r) => r.tenantName).sort()).toEqual(['100% Parks', 'Parks'])
      const literal = await requests.list({ search: '100%' })
      expect(literal.data.map((r) => r.tenantName)).toEqual(['100% Parks'])
      await expect(requests.list({ search: 'nobody' })).resolves.toMatchObject({
        count: 0,
        data: [],
      })
    })

    it('shows a tenant its latest request, and admins every request by status', async () => {
      await expect(requests.findLatestForTenant(PARKS, 'sms_number')).resolves.toBeNull()
      const first = await ask(PARKS)
      await requests.reject(first.id, 'Not yet', admin)
      const second = await ask(PARKS)
      await ask(ROADS)

      await expect(requests.findLatestForTenant(PARKS, 'sms_number')).resolves.toMatchObject({
        id: second.id,
      })
      const pending = await requests.list({ statuses: ['pending'] })
      expect(pending.data.map((r) => r.tenantName).sort()).toEqual(['Parks', 'Roads'])
      await expect(requests.list()).resolves.toMatchObject({ count: 3 })
    })
  })
})
