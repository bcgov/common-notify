import { pathToFileURL } from 'node:url'
import { CstarClient, validateIdentifier } from './cstar.js'

// Run inside the adapter pod, where the service-account Secret is already mounted.
// Never print tokens, credentials, member data, or upstream response bodies.
export async function verifyDev(config, tenantId, groupId, request = fetch) {
  const expected = {
    CSTAR_API_URL: 'https://dev.connect.digital.gov.bc.ca',
    CSTAR_TOKEN_URL:
      'https://dev.loginproxy.gov.bc.ca/auth/realms/standard/protocol/openid-connect/token',
    CSTAR_CLIENT_ID: 'notify-cstar-integration-6738',
  }
  for (const [name, value] of Object.entries(expected)) {
    if ((config[name] ?? '').replace(/\/$/, '') !== value)
      throw new Error(`${name} does not match the confirmed DEV settings`)
  }
  if (!config.CSTAR_CLIENT_SECRET) throw new Error('CSTAR_CLIENT_SECRET is not configured')
  validateIdentifier(tenantId)
  validateIdentifier(groupId)
  const client = new CstarClient(config, request)
  const { groups } = await client.listGroups(tenantId)
  const { emails } = await client.getRecipients(tenantId, [groupId])
  return {
    environment: 'DEV',
    groupCount: groups.length,
    uniqueEmailCount: emails.length,
    passed: true,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [tenantId, groupId] = process.argv.slice(2)
  if (!tenantId || !groupId) {
    console.error('Usage: node src/verify-dev.js <DEV-tenant-id> <DEV-group-id>')
    process.exitCode = 1
  } else {
    verifyDev(process.env, tenantId, groupId)
      .then((result) => console.log(JSON.stringify(result)))
      .catch((error) => {
        console.error(error instanceof Error ? error.message : 'DEV verification failed')
        process.exitCode = 1
      })
  }
}
