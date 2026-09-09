import {
  Controller,
  Post,
  Req,
  Version,
  UnauthorizedException,
  NotFoundException,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import { ConfigService } from '@nestjs/config'
import { Request } from 'express'
import { ApiKeysService } from './api-keys.service'

/**
 * Load-test-only API key binding.
 *
 * This endpoint used to be how every tenant onboarded: request a key in the API
 * Services Portal, then POST here from Postman with a user JWT and a CSTAR tenant id to
 * tie the two together. That path is **gone**. Keys are now issued from the Notify UI
 * (ApiKeysFrontendController), which mints the credential and binds it in one step
 * without anyone hand-assembling a request.
 *
 * What remains is the one caller that cannot use the UI: the k6 load test in
 * .github/workflows/load-test.yml, which runs in an ephemeral PR environment with no
 * user to authenticate as. It self-binds a pre-provisioned key to a throwaway tenant.
 *
 * Three things keep this from becoming a back door into tenant onboarding:
 *   - it only responds when `LOADTEST_AUTOBIND_ENABLED` is set,
 *   - that flag is forced off in any `-test` or `-prod` namespace (see configuration.ts),
 *   - and the service refuses to run there regardless, as defence in depth.
 *
 * It binds only to the fixed load-test tenant. There is no way to name a real tenant, so
 * it cannot be used to onboard one — which is the point. Keys already bound through the
 * old flow keep working untouched; tenant resolution still finds them by credential
 * identifier. See docs/api-key-self-service.md for the migration path.
 *
 * Hidden from the public API docs: it is infrastructure, not something to integrate with.
 */
@ApiExcludeController()
@Controller('service/api-key')
export class ApiKeysController {
  private readonly logger = new Logger(ApiKeysController.name)

  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly configService: ConfigService,
  ) {}

  @Version('1')
  @Post('bind')
  @HttpCode(HttpStatus.OK)
  async autoBindForLoadTest(@Req() request: Request): Promise<{ message: string }> {
    // Behave as though the route does not exist anywhere it is not enabled, rather than
    // advertising a disabled endpoint to anyone probing for it.
    if (!this.configService.get<boolean>('loadtest.autobindEnabled')) {
      throw new NotFoundException('Cannot POST /api/v1/service/api-key/bind')
    }

    // Set by Kong's key-auth plugin. Absent means the request did not come through the
    // gateway with a valid key.
    const credentialIdentifier = request.headers['x-credential-identifier'] as string
    if (!credentialIdentifier) {
      throw new UnauthorizedException(
        'Request must be made through the API gateway with a valid API key in the X-API-KEY header',
      )
    }

    const consumerId = (request.headers['x-consumer-id'] as string) || ''

    this.logger.warn(`[LOADTEST] Auto-binding credential ${credentialIdentifier}`)
    await this.apiKeysService.autoBindApiKeyForLoadTest(credentialIdentifier, consumerId)

    return { message: 'API key auto-bound to load-test tenant' }
  }
}
