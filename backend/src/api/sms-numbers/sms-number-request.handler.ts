import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import type { EntityManager } from 'typeorm'
import type { TenantRequest } from '../tenant-requests/entities/tenant-request.entity'
import type { RequestActor } from '../tenant-requests/tenant-request-codes'
import type { TenantRequestHandler } from '../tenant-requests/tenant-request-handler'
import { TenantRequestHandlerRegistry } from '../tenant-requests/tenant-request-handler.registry'
import type { TenantRequestDto } from '../tenant-requests/schemas/tenant-request.dto'
import { SMS_NUMBER_REQUEST_TYPE } from './sms-number-codes'
import { SmsNumbersService } from './sms-numbers.service'
import { ApproveSmsNumberRequestDto, SmsNumberRequestDto } from './schemas/sms-number.dto'

/** What approving a request granted: the number assigned, or none for the default number. */
interface Grant {
  tenant_request_id: string
  sms_number_id: string | null
  phone_number: string | null
}

/**
 * A tenant's request for an SMS number. Approving assigns the tenant the number the admin picks,
 * or, outside prod, leaves it on the default number; releasing takes the number back off it.
 * tenant_request_sms_number records what each approval granted.
 */
@Injectable()
export class SmsNumberRequestHandler implements TenantRequestHandler, OnModuleInit {
  readonly type = SMS_NUMBER_REQUEST_TYPE

  constructor(
    private readonly registry: TenantRequestHandlerRegistry,
    private readonly smsNumbersService: SmsNumbersService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this)
  }

  async approve(
    manager: EntityManager,
    request: TenantRequest,
    options: Record<string, unknown>,
    actor: RequestActor,
  ): Promise<void> {
    const choice = await parseOptions(options)
    if (choice.useDefaultNumber && !this.smsNumbersService.defaultNumberAssignable()) {
      throw new BadRequestException('The default number cannot be assigned in this environment')
    }
    const smsNumberId = choice.useDefaultNumber ? null : (choice.smsNumberId ?? null)
    if (smsNumberId) {
      await this.smsNumbersService.assign(request.tenantId, smsNumberId, actor, manager)
    }
    await manager.query(
      `INSERT INTO notify.tenant_request_sms_number
              (tenant_request_id, sms_number_id, created_by, created_by_name)
       VALUES ($1, $2, $3, $4)`,
      [request.id, smsNumberId, actor.id, actor.name],
    )
  }

  async release(
    manager: EntityManager,
    request: TenantRequest,
    actor: RequestActor,
  ): Promise<void> {
    const [grant] = await readGrants(manager, [request.id])
    // Approved on the default number: nothing was assigned, so there is nothing to take back.
    if (!grant?.sms_number_id) return
    await this.smsNumbersService.release(manager, request.tenantId, grant.sms_number_id, actor)
  }

  async describeOutcomes(
    manager: EntityManager,
    requestIds: string[],
  ): Promise<Map<string, string>> {
    const grants = await readGrants(manager, requestIds)
    return new Map(
      grants.map((grant) => [grant.tenant_request_id, grant.phone_number ?? 'Default number']),
    )
  }

  /** A request as the tenant's SMS settings show it, with the number approval gave it. */
  async toSmsDto(
    manager: EntityManager,
    request: TenantRequestDto | null,
  ): Promise<SmsNumberRequestDto | null> {
    if (!request) return null
    const [grant] = await readGrants(manager, [request.id])
    return {
      ...request,
      phoneNumber: grant?.phone_number ?? null,
      usesDefaultNumber: Boolean(grant) && grant.sms_number_id === null,
    }
  }
}

/** The admin's choice of number, validated as a request body would be. */
async function parseOptions(options: Record<string, unknown>): Promise<ApproveSmsNumberRequestDto> {
  const choice = plainToInstance(ApproveSmsNumberRequestDto, options)
  const errors = await validate(choice, { whitelist: true, forbidNonWhitelisted: true })
  if (errors.length > 0) {
    throw new BadRequestException(errors.flatMap((error) => Object.values(error.constraints ?? {})))
  }
  return choice
}

function readGrants(manager: EntityManager, requestIds: readonly string[]): Promise<Grant[]> {
  return manager.query(
    `SELECT d.tenant_request_id, d.sms_number_id, n.phone_number
       FROM notify.tenant_request_sms_number d
       LEFT JOIN notify.sms_number n ON n.id = d.sms_number_id
      WHERE d.tenant_request_id = ANY($1::uuid[])`,
    [requestIds],
  )
}
