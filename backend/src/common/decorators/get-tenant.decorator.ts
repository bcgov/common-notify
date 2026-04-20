import { createParamDecorator, ExecutionContext, BadRequestException } from '@nestjs/common'

/**
 * Extract the authenticated Tenant and Kong consumer ID from request.
 * Must be used in conjunction with the TenantGuard which populates request.tenant and request.kongConsumerId.
 *
 * Note: The actual tenant lookup is done in a Guard that executes before route handlers.
 *
 * Usage:
 * @Post('send')
 * async send(
 *   @GetTenant() tenant: Tenant,
 *   @GetTenant('kongId') kongConsumerId: string
 * ): Promise<void> { ... }
 */
export const GetTenant = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest()

  // If data is 'kongId', return Kong consumer ID, otherwise return tenant
  if (data === 'kongId') {
    const kongConsumerId = request.kongConsumerId
    if (!kongConsumerId) {
      throw new BadRequestException('Kong consumer ID not found in request.')
    }
    return kongConsumerId
  }

  const tenant = request.tenant

  if (!tenant) {
    throw new BadRequestException(
      'Tenant not found in request. This endpoint requires Kong authentication.',
    )
  }

  return tenant
})
