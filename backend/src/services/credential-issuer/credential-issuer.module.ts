import { Logger, Module, OnModuleInit } from '@nestjs/common'
import { ApsCredentialIssuerClient } from './aps-credential-issuer.client'
import { CREDENTIAL_ISSUER } from './credential-issuer.interface'

/**
 * Wires the credential issuer used by the self-service API key flow.
 *
 * There is one implementation, deliberately. Local development points APS_API_BASE_URL
 * at the mock in `.devcontainer/oauth2-mock-server.js` rather than swapping in a
 * different class, so the code exercised locally is the code that runs in production.
 *
 * A namespace with no APS configuration still starts; the client refuses issue requests
 * with a message naming the missing variables.
 */
@Module({
  providers: [
    ApsCredentialIssuerClient,
    { provide: CREDENTIAL_ISSUER, useExisting: ApsCredentialIssuerClient },
  ],
  exports: [CREDENTIAL_ISSUER],
})
export class CredentialIssuerModule implements OnModuleInit {
  private readonly logger = new Logger(CredentialIssuerModule.name)

  constructor(private readonly issuer: ApsCredentialIssuerClient) {}

  onModuleInit(): void {
    // Report an inconsistent pairing even when everything is present — all six variables
    // can be set and still describe two different APS deployments.
    const warning = this.issuer.configurationWarning()
    if (warning) {
      this.logger.warn(warning)
    }

    if (this.issuer.isConfigured()) {
      this.logger.log(`Issuing API keys via ${this.issuer.describeTarget()}`)
      return
    }

    this.logger.warn(
      'No credential issuer is configured. Self-service API key requests will be rejected ' +
        'until APS_API_BASE_URL, APS_GATEWAY_ID, APS_ENVIRONMENT_APP_ID, APS_TOKEN_URL, ' +
        'APS_CLIENT_ID and APS_CLIENT_SECRET are set.',
    )
  }
}
