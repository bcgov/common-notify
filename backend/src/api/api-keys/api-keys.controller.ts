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
import { ApiBody, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger'
import { ConfigService } from '@nestjs/config'
import { UseGuards } from '@nestjs/common'
import { Request } from 'express'
import { ApiKeysService } from './api-keys.service'
import { BindApiKeyDto } from './schemas/bind-api-key.dto'
import { JwtOrLoadtestBindGuard } from '../../common/guards/jwt-or-loadtest-bind.guard'

@ApiTags('API keys')
@ApiSecurity('api-key')
@Controller('service/api-key')
export class ApiKeysController {
  private readonly logger = new Logger(ApiKeysController.name)

  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly configService: ConfigService,
  ) {}

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
  @UseGuards(JwtOrLoadtestBindGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bind an API key to a tenant',
    description:
      'Associates the API key presented in `X-API-KEY` with a CSTAR tenant, so every later ' +
      'request made with that key is scoped to it. Do this once, before your first send.\n\n' +
      'The call must go through the API gateway (Kong validates the key) and must also carry a ' +
      'user SSO JWT in `Authorization`, because the backend checks that the user is a member of ' +
      'the tenant being claimed. A key can be bound to exactly one tenant.',
  })
  @ApiBody({
    type: BindApiKeyDto,
    examples: {
      bind: {
        summary: 'Bind to a tenant',
        value: { cstarTenantId: 'd290f1ee-6c54-4b01-90e6-d701748f0851' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Bound. Later requests with this key resolve to the tenant.',
    schema: { example: { message: 'API key successfully bound to tenant' } },
  })
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

    // Load-test-only path (PR dev): no user JWT, self-bind to a throwaway tenant.
    if (this.configService.get<boolean>('loadtest.autobindEnabled') && !idirUserGuid) {
      this.logger.warn(`[LOADTEST] Auto-binding credential ${credentialIdentifier} (no JWT)`)
      await this.apiKeysService.autoBindApiKeyForLoadTest(credentialIdentifier, consumerId)
      return { message: 'API key auto-bound to load-test tenant' }
    }

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
