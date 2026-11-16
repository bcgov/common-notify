import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { DataSource } from 'typeorm'
import { SmsNumbersService } from '../src/api/sms-numbers/sms-numbers.service'
import { SmsNumberRequestsService } from '../src/api/sms-numbers/sms-number-requests.service'
import { SmsNumber } from '../src/api/sms-numbers/entities/sms-number.entity'
import { TenantSmsNumber } from '../src/api/sms-numbers/entities/tenant-sms-number.entity'
import { SmsNumberRequest } from '../src/api/sms-numbers/entities/sms-number-request.entity'
import { SmsNumberRequestHistory } from '../src/api/sms-numbers/entities/sms-number-request-history.entity'
import type { ISmsTransport } from '../src/adapters'

/**
 * SMS numbers, assignments and requests against a real Postgres, on the schema V81 creates: the
 * per-provider assignment rule and the one-pending-request rule are constraints, so only the
 * database can show they hold.
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
 * The migration that creates these tables, found by name rather than version: a version can be
 * renumbered to land after another branch's migration.
 */
function smsNumbersMigration(): string {
  const dir = join(__dirname, '../../migrations/sql')
  const [file] = readdirSync(dir).filter((name) => /^V\d+__sms_numbers\.sql$/.test(name))
  if (!file) throw new Error(`No V*__sms_numbers.sql migration in ${dir}`)
  return readFileSync(join(dir, file), 'utf8')
}

const PARKS = '7f1d5c9e-0000-4000-8000-0000000000a1'
const ROADS = '7f1d5c9e-0000-4000-8000-0000000000a2'
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
  let requests: SmsNumberRequestsService

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
      entities: [SmsNumber, TenantSmsNumber, SmsNumberRequest, SmsNumberRequestHistory],
      synchronize: false,
    })
    await dataSource.initialize()
    // Only the tenant columns V81 and these services touch.
    await dataSource.query(`
      CREATE SCHEMA notify;
      CREATE TABLE notify.tenant (
        id UUID PRIMARY KEY, name VARCHAR(200) NOT NULL, is_deleted BOOLEAN NOT NULL DEFAULT FALSE
      );`)
    await dataSource.query(smsNumbersMigration())
    await dataSource.query(
      `INSERT INTO notify.tenant (id, name) VALUES ($1, 'Parks'), ($2, 'Roads')`,
      [PARKS, ROADS],
    )

    numbers = new SmsNumbersService(
      dataSource.getRepository(SmsNumber),
      dataSource.getRepository(TenantSmsNumber),
      { name: 'aws' } as ISmsTransport,
      { get: (key: string) => config[key] } as unknown as ConfigService,
    )
    requests = new SmsNumberRequestsService(dataSource.getRepository(SmsNumberRequest), numbers)
  })

  afterAll(async () => {
    await dataSource?.destroy()
  })

  beforeEach(async () => {
    config['smsNumbers.defaultNumberAssignable'] = true
    await dataSource.query(
      `TRUNCATE notify.sms_number_request_history, notify.sms_number_request,
                notify.tenant_sms_number, notify.sms_number`,
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
      expect(codes.requestStatuses.map((s) => s.code)).toEqual([
        'approved',
        'cancelled',
        'pending',
        'rejected',
        'released',
      ])
      expect(codes.numberTypes.map((t) => t.code)).toContain('rcs')
      expect(codes.activeProvider).toBe('aws')
    })
  })

  describe('requests', () => {
    it('allows one pending request per tenant', async () => {
      const request = await requests.create(PARKS, tenantUser)

      expect(request).toMatchObject({
        tenantName: 'Parks',
        statusCode: 'pending',
        requestedBy: 'Terry User',
        decidedAt: null,
      })
      await expect(requests.create(PARKS, tenantUser)).rejects.toBeInstanceOf(ConflictException)
      await expect(requests.create(ROADS, tenantUser)).resolves.toBeDefined()
    })

    it('approves by assigning the number, recording who decided', async () => {
      const number = await addNumber('+15814360804')
      const request = await requests.create(PARKS, tenantUser)

      const approved = await requests.approve(request.id, number.id, admin)

      expect(approved).toMatchObject({
        statusCode: 'approved',
        phoneNumber: '+15814360804',
        decidedBy: 'Pat Admin',
      })
      expect(approved.decidedAt).not.toBeNull()
      await expect(numbers.getFromNumber(PARKS, 'aws')).resolves.toBe('+15814360804')
    })

    it('leaves the request pending if the number cannot be assigned', async () => {
      const request = await requests.create(PARKS, tenantUser)

      await expect(
        requests.approve(request.id, '7f1d5c9e-0000-4000-8000-0000000000ff', admin),
      ).rejects.toBeInstanceOf(NotFoundException)

      await expect(requests.findLatestForTenant(PARKS)).resolves.toMatchObject({
        statusCode: 'pending',
      })
    })

    it('rejects with a reason, and decides a request only once', async () => {
      const number = await addNumber('+15814360804')
      const request = await requests.create(PARKS, tenantUser)

      await expect(requests.reject(request.id, 'No use case given', admin)).resolves.toMatchObject({
        statusCode: 'rejected',
        decisionReason: 'No use case given',
        decidedBy: 'Pat Admin',
      })
      await expect(requests.approve(request.id, number.id, admin)).rejects.toBeInstanceOf(
        ConflictException,
      )
      await expect(requests.release(request.id, admin)).rejects.toBeInstanceOf(ConflictException)
    })

    it('lets a tenant cancel its own pending request, recording who and when', async () => {
      const request = await requests.create(PARKS, tenantUser)

      await expect(requests.cancel(ROADS, request.id, tenantUser)).rejects.toBeInstanceOf(
        NotFoundException,
      )
      const cancelled = await requests.cancel(PARKS, request.id, tenantUser)

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
      await expect(requests.create(PARKS, tenantUser)).resolves.toMatchObject({
        statusCode: 'pending',
      })
      const history = await dataSource
        .getRepository(SmsNumberRequestHistory)
        .find({ where: { smsNumberRequestId: request.id }, order: { createdAt: 'ASC' } })
      expect(history.map((row) => [row.statusCode, row.createdByName])).toEqual([
        ['pending', 'Terry User'],
        ['cancelled', 'Terry User'],
      ])
    })

    it('cancels only a pending request', async () => {
      const number = await addNumber('+15814360804')
      const request = await requests.create(PARKS, tenantUser)
      await requests.approve(request.id, number.id, admin)

      await expect(requests.cancel(PARKS, request.id, tenantUser)).rejects.toBeInstanceOf(
        ConflictException,
      )
    })

    it('releases an approved number, by an admin or the tenant itself', async () => {
      const number = await addNumber('+15814360804')
      const request = await requests.create(PARKS, tenantUser)
      await requests.approve(request.id, number.id, admin)

      // Another tenant cannot see it, let alone release it.
      await expect(requests.release(request.id, tenantUser, ROADS)).rejects.toBeInstanceOf(
        NotFoundException,
      )
      const released = await requests.release(request.id, tenantUser, PARKS)

      expect(released).toMatchObject({
        statusCode: 'released',
        releasedBy: 'Terry User',
        // The approval is still on record.
        decidedBy: 'Pat Admin',
        phoneNumber: '+15814360804',
      })
      expect(released.releasedAt).not.toBeNull()
      await expect(numbers.getFromNumber(PARKS, 'aws')).resolves.toBeNull()
      await expect(requests.release(request.id, admin)).rejects.toBeInstanceOf(ConflictException)
    })

    it('releases the request when an admin unassigns or replaces its number directly', async () => {
      const first = await addNumber('+15814360804')
      const second = await addNumber('+15814360805')
      const replaced = await requests.create(PARKS, tenantUser)
      await requests.approve(replaced.id, first.id, admin)
      const unassigned = await requests.create(ROADS, tenantUser)
      await requests.approve(unassigned.id, first.id, admin)

      await numbers.assign(PARKS, second.id, admin)
      await numbers.unassign(ROADS, first.id, admin)

      const byId = new Map((await requests.list()).map((r) => [r.id, r]))
      expect(byId.get(replaced.id)).toMatchObject({
        statusCode: 'released',
        releasedBy: 'Pat Admin',
      })
      expect(byId.get(unassigned.id)).toMatchObject({ statusCode: 'released' })
    })

    it('keeps who created the request, and who last changed it', async () => {
      const number = await addNumber('+15814360804')
      const request = await requests.create(PARKS, tenantUser)
      const auditOf = async () =>
        dataSource.getRepository(SmsNumberRequest).findOneByOrFail({ id: request.id })

      await expect(auditOf()).resolves.toMatchObject({
        createdBy: 'tuser',
        createdByName: 'Terry User',
        updatedBy: 'tuser',
      })
      await requests.approve(request.id, number.id, admin)
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
      const approved = await requests.create(PARKS, tenantUser)
      await requests.approve(approved.id, number.id, admin)
      await numbers.unassign(PARKS, number.id, admin)
      const rejected = await requests.create(ROADS, tenantUser)
      await requests.reject(rejected.id, 'No opt-out steps', admin)

      const history = await dataSource.getRepository(SmsNumberRequestHistory).find({
        order: { createdAt: 'ASC' },
      })
      const rows = (requestId: string) =>
        history
          .filter((row) => row.smsNumberRequestId === requestId)
          .map((row) => [row.statusCode, row.createdByName, row.reason, row.smsNumberId])

      expect(rows(approved.id)).toEqual([
        ['pending', 'Terry User', null, null],
        ['approved', 'Pat Admin', null, number.id],
        ['released', 'Pat Admin', null, number.id],
      ])
      expect(rows(rejected.id)).toEqual([
        ['pending', 'Terry User', null, null],
        ['rejected', 'Pat Admin', 'No opt-out steps', null],
      ])
      expect(history.every((row) => row.createdAt instanceof Date)).toBe(true)
    })

    it('approves on the default number outside prod, assigning nothing', async () => {
      const request = await requests.create(PARKS, tenantUser)

      const approved = await requests.approve(request.id, null, admin)

      expect(approved).toMatchObject({
        statusCode: 'approved',
        usesDefaultNumber: true,
        phoneNumber: null,
        decidedBy: 'Pat Admin',
      })
      await expect(dataSource.getRepository(TenantSmsNumber).count()).resolves.toBe(0)
      await expect(requests.release(request.id, tenantUser, PARKS)).resolves.toMatchObject({
        statusCode: 'released',
        usesDefaultNumber: true,
        releasedBy: 'Terry User',
      })
      const history = await dataSource
        .getRepository(SmsNumberRequestHistory)
        .find({ where: { smsNumberRequestId: request.id }, order: { createdAt: 'ASC' } })
      expect(history.map((row) => row.statusCode)).toEqual(['pending', 'approved', 'released'])
    })

    it('refuses the default number in prod, leaving the request pending', async () => {
      config['smsNumbers.defaultNumberAssignable'] = false
      const request = await requests.create(PARKS, tenantUser)

      await expect(requests.approve(request.id, null, admin)).rejects.toBeInstanceOf(
        BadRequestException,
      )
      await expect(requests.findLatestForTenant(PARKS)).resolves.toMatchObject({
        statusCode: 'pending',
        usesDefaultNumber: false,
      })
      await expect(numbers.getCodes()).resolves.toMatchObject({
        defaultNumber: '+15550009999',
        defaultNumberAssignable: false,
      })
    })

    it('shows a tenant its latest request, and admins every request by status', async () => {
      await expect(requests.findLatestForTenant(PARKS)).resolves.toBeNull()
      const first = await requests.create(PARKS, tenantUser)
      await requests.reject(first.id, 'Not yet', admin)
      const second = await requests.create(PARKS, tenantUser)
      await requests.create(ROADS, tenantUser)

      await expect(requests.findLatestForTenant(PARKS)).resolves.toMatchObject({ id: second.id })
      expect((await requests.list('pending')).map((r) => r.tenantName).sort()).toEqual([
        'Parks',
        'Roads',
      ])
      await expect(requests.list()).resolves.toHaveLength(3)
    })
  })
})
