/**
 * Which APS deployment a URL belongs to.
 *
 * `unknown` is deliberate and load-bearing: an unrecognised host must not be treated as
 * a mismatch, or a legitimate setup nobody anticipated would produce a scary warning.
 */
export type ApsInstance = 'local-mock' | 'aps-test' | 'aps-prod' | 'unknown'

/**
 * Classify an APS URL by host.
 *
 * The three deployments in play:
 *   - the mock in .devcontainer/oauth2-mock-server.js
 *   - the APS test instance, where the Credential Issuer API currently lives
 *   - the APS production instance, which hosts gw-fe8c5
 */
export function classifyApsHost(url: string | undefined): ApsInstance {
  if (!url) return 'unknown'

  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return 'unknown'
  }

  if (host === 'oauth2-mock' || host === 'localhost' || host === '127.0.0.1') {
    return 'local-mock'
  }
  if (host.endsWith('.test.api.gov.bc.ca')) {
    return 'aps-test'
  }
  if (host === 'api.gov.bc.ca' || host === 'authz.apps.gov.bc.ca') {
    return 'aps-prod'
  }
  return 'unknown'
}

const LABELS: Record<ApsInstance, string> = {
  'local-mock': 'the local mock',
  'aps-test': 'the APS test instance',
  'aps-prod': 'the APS production instance',
  unknown: 'an unrecognised host',
}

/**
 * A human-readable description of what the issuer is actually talking to.
 *
 * The class name alone ("aps-directory-api") is the same whether it is pointed at the
 * local mock or at production, which makes the startup line useless for answering the
 * one question people actually ask: where is this pointed right now?
 */
export function describeApsTarget(
  baseUrl: string | undefined,
  gatewayId: string | undefined,
): string {
  const instance = classifyApsHost(baseUrl)
  const where = instance === 'unknown' ? (baseUrl ?? 'nowhere') : `${LABELS[instance]} (${baseUrl})`

  return gatewayId ? `${where}, gateway ${gatewayId}` : where
}

/**
 * Warn when the token endpoint and the Directory API belong to different deployments.
 *
 * A token is only valid to the instance that issued it, so this combination always
 * fails — but it fails late, as a 401 when someone clicks Generate, and a 401 reads
 * like a permissions problem. Catching it at boot puts the diagnosis in the logs before
 * anyone goes looking through the Portal for a scope that was never missing.
 *
 * Returns null when the pair is consistent, or when either side is unrecognised.
 */
export function describeApsInstanceMismatch(
  tokenUrl: string | undefined,
  baseUrl: string | undefined,
): string | null {
  const token = classifyApsHost(tokenUrl)
  const api = classifyApsHost(baseUrl)

  if (token === 'unknown' || api === 'unknown' || token === api) {
    return null
  }

  return (
    `APS configuration is inconsistent: APS_TOKEN_URL points at ${LABELS[token]} but ` +
    `APS_API_BASE_URL points at ${LABELS[api]}. A token is only valid to the instance ` +
    'that issued it, so issuing API keys will fail with a 401. Set both to the same ' +
    'instance.'
  )
}
