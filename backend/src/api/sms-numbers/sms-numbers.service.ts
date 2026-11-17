import { ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, Repository } from 'typeorm'
import { SMS_ADAPTER } from '../../adapters'
import type { ISmsTransport } from '../../adapters'
import { TenantRequestsService } from '../tenant-requests/tenant-requests.service'
import type { RequestActor } from '../tenant-requests/tenant-request-codes'
import { SmsNumber } from './entities/sms-number.entity'
import { TenantSmsNumber } from './entities/tenant-sms-number.entity'
import {
  CreateSmsNumberDto,
  SmsCodeDto,
  SmsNumberCodesDto,
  SmsNumberDto,
  UpdateSmsNumberDto,
} from './schemas/sms-number.dto'

/** The provider used when none is configured; matches the SMS_ADAPTER fallback. */
const DEFAULT_PROVIDER = 'aws'

/**
 * The SMS number inventory and which tenant sends from which number.
 *
 * A tenant holds at most one number per provider, so the number a send uses depends on the
 * provider sending it. Switching providers changes which of a tenant's numbers is used without any
 * data change; a tenant with none for the active provider sends from DEFAULT_SMS_FROM_NUMBER.
 */
@Injectable()
export class SmsNumbersService {
  constructor(
    @InjectRepository(SmsNumber) private readonly numberRepository: Repository<SmsNumber>,
    @InjectRepository(TenantSmsNumber)
    private readonly assignmentRepository: Repository<TenantSmsNumber>,
    private readonly tenantRequests: TenantRequestsService,
    @Optional() @Inject(SMS_ADAPTER) private readonly smsAdapter?: ISmsTransport,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  /**
   * What a tenant without a number of its own sends from through the active provider: that
   * provider's default number, else the DEFAULT_SMS_FROM_NUMBER environment variable.
   */
  async defaultNumber(): Promise<string | null> {
    const flagged = await this.numberRepository.findOne({
      where: { providerCode: this.activeProvider(), isDefault: true, isDeleted: false },
    })
    return (
      flagged?.phoneNumber ?? this.configService?.get<string>('defaults.sms.fromNumber') ?? null
    )
  }

  /** Whether approving a request may assign the default number: every environment but prod. */
  defaultNumberAssignable(): boolean {
    return this.configService?.get<boolean>('smsNumbers.defaultNumberAssignable') ?? false
  }

  /** The provider SMS is sending through now: the configured transport's name. */
  activeProvider(): string {
    return this.smsAdapter?.name ?? DEFAULT_PROVIDER
  }

  /**
   * The number this tenant sends from through the given provider: its own, else the provider's
   * default. Null leaves the transport its DEFAULT_SMS_FROM_NUMBER.
   */
  async getFromNumber(tenantId: string, providerCode: string): Promise<string | null> {
    const rows: Array<{ phone_number: string | null }> = await this.numberRepository.query(
      `SELECT COALESCE(
                (SELECT n.phone_number
                   FROM notify.tenant_sms_number a
                   JOIN notify.sms_number n ON n.id = a.sms_number_id
                  WHERE a.tenant_id = $1 AND a.provider_code = $2 AND NOT n.is_deleted),
                (SELECT phone_number
                   FROM notify.sms_number
                  WHERE provider_code = $2 AND is_default AND NOT is_deleted)
              ) AS phone_number`,
      [tenantId, providerCode],
    )
    return rows[0]?.phone_number ?? null
  }

  /**
   * The number this tenant's SMS goes out from right now: its own for the active provider, else
   * that provider's default, else DEFAULT_SMS_FROM_NUMBER. What a send through the active
   * transport resolves to, for showing a tenant its sender.
   */
  async resolveSenderNumber(tenantId: string): Promise<string | null> {
    return (
      (await this.getFromNumber(tenantId, this.activeProvider())) ??
      this.configService?.get<string>('defaults.sms.fromNumber') ??
      null
    )
  }

  /**
   * Makes this the number a tenant without one of its own sends from through its provider,
   * replacing that provider's previous default.
   */
  async setDefault(id: string, actor: RequestActor): Promise<SmsNumberDto> {
    await this.numberRepository.manager.transaction(async (manager) => {
      const number = await manager.findOne(SmsNumber, { where: { id, isDeleted: false } })
      if (!number) throw new NotFoundException(`SMS number ${id} not found`)
      // Cleared first: the unique index allows one default per provider at any moment.
      await manager.update(
        SmsNumber,
        { providerCode: number.providerCode, isDefault: true },
        { isDefault: false, updatedBy: actor.id },
      )
      await manager.update(SmsNumber, { id }, { isDefault: true, updatedBy: actor.id })
    })
    return this.findListed(id)
  }

  /** Stops using this number as its provider's default: DEFAULT_SMS_FROM_NUMBER applies again. */
  async clearDefault(id: string, actor: RequestActor): Promise<SmsNumberDto> {
    const number = await this.findNumber(id)
    number.isDefault = false
    number.updatedBy = actor.id
    await this.numberRepository.save(number)
    return this.findListed(id)
  }

  /** Every number in the inventory, with the tenants assigned each. */
  async listNumbers(): Promise<SmsNumberDto[]> {
    const rows: Array<{
      id: string
      phone_number: string
      provider_code: string
      number_type_code: string
      description: string | null
      is_default: boolean
      tenants: Array<{ tenantId: string; tenantName: string }> | null
    }> = await this.numberRepository.query(
      `SELECT n.id, n.phone_number, n.provider_code, n.number_type_code,
              n.description, n.is_default,
              json_agg(json_build_object('tenantId', t.id, 'tenantName', t.name) ORDER BY t.name)
                FILTER (WHERE t.id IS NOT NULL) AS tenants
         FROM notify.sms_number n
         LEFT JOIN notify.tenant_sms_number a ON a.sms_number_id = n.id
         LEFT JOIN notify.tenant t ON t.id = a.tenant_id
        WHERE NOT n.is_deleted
        GROUP BY n.id
        ORDER BY n.provider_code, n.phone_number`,
    )
    return rows.map((row) => ({
      id: row.id,
      phoneNumber: row.phone_number,
      providerCode: row.provider_code,
      numberTypeCode: row.number_type_code,
      description: row.description,
      isDefault: row.is_default,
      tenants: row.tenants ?? [],
    }))
  }

  /** The code tables an admin picks from, and the provider in use. */
  async getCodes(): Promise<SmsNumberCodesDto> {
    const read = (table: string): Promise<SmsCodeDto[]> =>
      this.numberRepository.query(`SELECT code, description FROM notify.${table} ORDER BY code`)
    const [providers, numberTypes] = await Promise.all([
      read('sms_provider_code'),
      read('sms_number_type_code'),
    ])
    return {
      providers,
      numberTypes,
      activeProvider: this.activeProvider(),
      defaultNumber: await this.defaultNumber(),
      defaultNumberAssignable: this.defaultNumberAssignable(),
    }
  }

  async createNumber(dto: CreateSmsNumberDto, actor: RequestActor): Promise<SmsNumberDto> {
    const existing = await this.numberRepository.findOne({
      where: { providerCode: dto.providerCode, phoneNumber: dto.phoneNumber, isDeleted: false },
    })
    if (existing) {
      throw new ConflictException(`${dto.phoneNumber} is already listed for ${dto.providerCode}`)
    }

    const saved = await this.numberRepository.save(
      this.numberRepository.create({
        phoneNumber: dto.phoneNumber,
        providerCode: dto.providerCode,
        numberTypeCode: dto.numberTypeCode,
        description: dto.description ?? null,
        createdBy: actor.id,
        updatedBy: actor.id,
      }),
    )
    return toDto(saved, [])
  }

  async updateNumber(
    id: string,
    dto: UpdateSmsNumberDto,
    actor: RequestActor,
  ): Promise<SmsNumberDto> {
    const number = await this.findNumber(id)
    if (dto.numberTypeCode !== undefined) number.numberTypeCode = dto.numberTypeCode
    if (dto.description !== undefined) number.description = dto.description
    number.updatedBy = actor.id
    await this.numberRepository.save(number)
    return this.findListed(id)
  }

  /**
   * Removes a number from the inventory. One still assigned to a tenant must be unassigned first,
   * and the default must stop being the default.
   */
  async deleteNumber(id: string, actor: RequestActor): Promise<void> {
    const number = await this.findNumber(id)
    if (number.isDefault) {
      throw new ConflictException(
        `${number.phoneNumber} is the default number for ${number.providerCode}; stop using it as the default first`,
      )
    }
    const assigned = await this.assignmentRepository.count({ where: { smsNumberId: id } })
    if (assigned > 0) {
      throw new ConflictException(
        `${number.phoneNumber} is assigned to ${assigned} tenant(s); unassign it first`,
      )
    }
    number.isDeleted = true
    number.updatedBy = actor.id
    await this.numberRepository.save(number)
  }

  /**
   * Makes this the number the tenant sends from through the number's provider, replacing any it
   * had for that provider; an approved request for the replaced number is marked released. Pass a
   * transaction's manager to make it part of a larger change.
   */
  async assign(
    tenantId: string,
    smsNumberId: string,
    actor: RequestActor,
    manager?: EntityManager,
  ): Promise<SmsNumber> {
    if (manager) return this.assignWithin(manager, tenantId, smsNumberId, actor)
    return this.assignmentRepository.manager.transaction((tx) =>
      this.assignWithin(tx, tenantId, smsNumberId, actor),
    )
  }

  private async assignWithin(
    manager: EntityManager,
    tenantId: string,
    smsNumberId: string,
    actor: RequestActor,
  ): Promise<SmsNumber> {
    const number = await manager.findOne(SmsNumber, {
      where: { id: smsNumberId, isDeleted: false },
    })
    if (!number) throw new NotFoundException(`SMS number ${smsNumberId} not found`)
    const tenants: unknown[] = await manager.query(
      'SELECT 1 FROM notify.tenant WHERE id = $1 AND NOT is_deleted',
      [tenantId],
    )
    if (tenants.length === 0) throw new NotFoundException(`Tenant ${tenantId} not found`)

    const current = await manager.findOne(TenantSmsNumber, {
      where: { tenantId, providerCode: number.providerCode },
    })
    if (current?.smsNumberId === smsNumberId) return number
    if (current) {
      await manager.delete(TenantSmsNumber, { id: current.id })
      await this.markReleased(manager, tenantId, current.smsNumberId, actor)
    }
    await manager.insert(TenantSmsNumber, {
      tenantId,
      smsNumberId,
      providerCode: number.providerCode,
      createdBy: actor.id,
      createdByName: actor.name,
    })
    return number
  }

  /** Takes a number off a tenant; an approved request for it is marked released. */
  async unassign(tenantId: string, smsNumberId: string, actor: RequestActor): Promise<void> {
    await this.assignmentRepository.manager.transaction(async (manager) => {
      const released = await this.release(manager, tenantId, smsNumberId, actor)
      if (!released) throw new NotFoundException('That number is not assigned to this tenant')
    })
  }

  /**
   * Takes a number off a tenant and marks its approved request for the number released, within
   * the caller's transaction. Returns whether the number was assigned.
   */
  async release(
    manager: EntityManager,
    tenantId: string,
    smsNumberId: string,
    actor: RequestActor,
  ): Promise<boolean> {
    const result = await manager.delete(TenantSmsNumber, { tenantId, smsNumberId })
    await this.markReleased(manager, tenantId, smsNumberId, actor)
    return Boolean(result.affected)
  }

  /**
   * Keeps requests in step with assignments: an approved request whose number is gone is released,
   * with a history row recording who released it.
   */
  private async markReleased(
    manager: EntityManager,
    tenantId: string,
    smsNumberId: string,
    actor: RequestActor,
  ): Promise<void> {
    const rows: Array<{ id: string }> = await manager.query(
      `SELECT r.id
         FROM notify.tenant_request r
         JOIN notify.tenant_request_sms_number d ON d.tenant_request_id = r.id
        WHERE r.tenant_id = $1 AND d.sms_number_id = $2`,
      [tenantId, smsNumberId],
    )
    await this.tenantRequests.markReleased(
      manager,
      rows.map((row) => row.id),
      actor,
    )
  }

  /** One number as the inventory lists it, with its tenants. */
  private async findListed(id: string): Promise<SmsNumberDto> {
    const listed = (await this.listNumbers()).find((row) => row.id === id)
    if (!listed) throw new NotFoundException(`SMS number ${id} not found`)
    return listed
  }

  private async findNumber(id: string): Promise<SmsNumber> {
    const number = await this.numberRepository.findOne({ where: { id, isDeleted: false } })
    if (!number) throw new NotFoundException(`SMS number ${id} not found`)
    return number
  }
}

function toDto(number: SmsNumber, tenants: SmsNumberDto['tenants']): SmsNumberDto {
  return {
    id: number.id,
    phoneNumber: number.phoneNumber,
    providerCode: number.providerCode,
    numberTypeCode: number.numberTypeCode,
    description: number.description,
    isDefault: number.isDefault,
    tenants,
  }
}
