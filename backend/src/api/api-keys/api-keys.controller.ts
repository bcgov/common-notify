import {
  Controller,
  Post,
  Body,
  Req,
  Version,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { UseGuards } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Request } from 'express'
import { ApiKeysService } from './api-keys.service'
import { BindApiKeyDto } from './dto/bind-api-key.dto'

@ApiTags('api-keys')
@Controller('service/api-key')
export class ApiKeysController {
  private readonly logger = new Logger(ApiKeysController.name)

  constructor(private readonly apiKeysService: ApiKeysService) {}

  /**
   * Bind an API key to a CSTAR tenant.
   *
   * This endpoint must be called through the API gateway so that Kong's key-auth
   * plugin validates the API key and forwards the x-credential-identifier header.
   * The caller must also supply a valid user JWT in the Authorization header so
   * the backend can verify CSTAR tenant membership.
   *
   * Request requirements:
   *   - X-API-KEY header: the API key being bound (consumed/validated by Kong)
   *   - Authorization: Bearer <jwt>: the user's SSO JWT (validated by backend)
   *   - Body: { cstarTenantId: "<guid>" }
   *
   * Kong forwards x-credential-identifier and x-consumer-id headers after validating
   * the API key. These are used as the stable binding keys — never the raw key value.
   */
  @Version('1')
  @Post('bind')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bind an API key to a CSTAR tenant' })
  @ApiResponse({ status: 200, description: 'API key successfully bound to tenant' })
  @ApiResponse({ status: 401, description: 'API key not authenticated by gateway or invalid JWT' })
  @ApiResponse({ status: 403, description: 'User is not a member of the specified CSTAR tenant' })
  @ApiResponse({ status: 404, description: 'No Notify tenant configured for the CSTAR tenant ID' })
  @ApiResponse({ status: 409, description: 'API key is already bound to a different tenant' })
  async bindApiKey(
    @Body() dto: BindApiKeyDto,
    @Req() request: Request,
  ): Promise<{ message: string }> {
    // x-credential-identifier is set by Kong's key-auth plugin.
    // If missing, the request did not come through the gateway with a valid key.
    const credentialIdentifier = request.headers['x-credential-identifier'] as string
    if (!credentialIdentifier) {
      throw new UnauthorizedException(
        'Request must be made through the API gateway with a valid API key in the X-API-KEY header',
      )
    }

    const consumerId = (request.headers['x-consumer-id'] as string) || ''
    const jwtUser = (request as any).user as { idir_user_guid?: string } | undefined
    const idirUserGuid = jwtUser?.idir_user_guid

    if (!idirUserGuid) {
      throw new UnauthorizedException('JWT is missing required idir_user_guid claim')
    }

    const authHeader = request.headers.authorization as string

    await this.apiKeysService.bindApiKey({
      credentialIdentifier,
      consumerId,
      cstarTenantId: dto.cstarTenantId,
      idirUserGuid,
      authHeader,
    })

    return { message: 'API key successfully bound to tenant' }
  }
}
