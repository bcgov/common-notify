import {
  Controller,
  Post,
  Req,
  Version,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
} from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import { Request } from 'express'
import { ApiKeysService } from './api-keys.service'
import { LoadtestAutobindGuard } from '../../common/guards/loadtest-autobind.guard'

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
 *   - it only responds when `LOADTEST_AUTOBIND_ENABLED` is set (LoadtestAutobindGuard),
 *   - that flag is forced off in any `-test` or `-prod` namespace (see configuration.ts),
 *   - and the service refuses to run there regardless, as defence in depth.
 *
 * It binds only to the fixed load-test tenant. There is no way to name a real tenant, so
 * it cannot be used to onboard one — which is the point. Keys already bound through the
 * old flow keep working untouched; tenant resolution still finds them by credential
 * identifier.
 *
 * Hidden from the public API docs: it is infrastructure, not something to integrate with.
 */
@ApiExcludeController()
@Controller('service/api-key')
export class ApiKeysController {
  private readonly logger = new Logger(ApiKeysController.name)

  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Version('1')
  @Post('bind')
  @HttpCode(HttpStatus.OK)
  // Without a guard the global JwtGuard rejects the route outright; this one also carries the
  // enabled-flag and came-through-the-gateway checks.
  @UseGuards(LoadtestAutobindGuard)
  async autoBindForLoadTest(@Req() request: Request): Promise<{ message: string }> {
    const credentialIdentifier = request.headers['x-credential-identifier'] as string

    const consumerId = (request.headers['x-consumer-id'] as string) || ''

    this.logger.warn(`[LOADTEST] Auto-binding credential ${credentialIdentifier}`)
    await this.apiKeysService.autoBindApiKeyForLoadTest(credentialIdentifier, consumerId)

    return { message: 'API key auto-bound to load-test tenant' }
  }
}
