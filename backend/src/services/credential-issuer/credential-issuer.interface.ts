/**
 * Injection token for the active {@link CredentialIssuer} implementation.
 *
 * There is one implementation — the APS Directory API client. Local development points
 * it at the mock in `.devcontainer/oauth2-mock-server.js`, so the class under test
 * locally is the one that runs in production.
 */
export const CREDENTIAL_ISSUER = Symbol('CREDENTIAL_ISSUER')

/**
 * A credential minted by the gateway for one product environment.
 *
 * Which fields are populated depends on the environment's flow. Notify's gateway
 * environments use `kong-api-key-only`, so `apiKey` is the field that matters; the
 * OAuth fields are carried through unchanged for future client-credentials
 * environments rather than being dropped on the floor.
 */
export interface IssuedCredential {
  /** Gateway flow that produced this credential, e.g. `kong-api-key-only`. */
  flow: string
  /** Stable consumer identifier, formatted `{environmentAppId}-{applicationAppId}`. */
  clientId: string
  /** The API key value. Returned exactly once — never retrievable again. */
  apiKey?: string
  /**
   * Kong's per-credential ID, i.e. the value Kong later forwards as
   * `x-credential-identifier`.
   *
   * The APS Directory API does not return it, so it is normally absent. When it is,
   * the binding is resolved on the first gateway-authenticated request via the consumer
   * username and backfilled then — see resolve-api-key-consumer.ts.
   */
  credentialIdentifier?: string
  clientSecret?: string
  issuer?: string
  tokenEndpoint?: string
}

/** Arguments for minting a brand-new credential. */
export interface IssueCredentialRequest {
  /** Application name shown on the gateway's Consumers page. */
  applicationName: string
  applicationDescription?: string
  /** Labels attached to the consumer, used to filter the Consumers page. */
  labels?: Record<string, string>
}

/**
 * Issues and rotates gateway consumer credentials.
 *
 * Revocation is deliberately absent: the APS Credential Issuer API does not expose
 * it yet. Notify revokes a key by dropping its local binding, which stops the key
 * from resolving to a tenant; removing the consumer from the gateway is still a
 * manual step on the Portal's Consumers page.
 */
export interface CredentialIssuer {
  /** Human-readable name of the backing implementation, for logs and health output. */
  readonly name: string

  /** False when the issuer is not configured, so callers can fail with a clear message. */
  isConfigured(): boolean

  issue(request: IssueCredentialRequest): Promise<IssuedCredential>

  /** Rotate the secret/key in place. The clientId is unchanged; the key value is new. */
  regenerate(clientId: string): Promise<IssuedCredential>
}
