import { createHash } from 'node:crypto'
import { CstarClient, validateIdentifier } from './cstar.js'

// Local fixtures are deliberately separate from login/tenant/role authorization.
export function createCstarClient(config = process.env) {
  if (config.CSTAR_MOCK_MODE !== 'true') return new CstarClient(config)
  if (config.NODE_ENV !== 'development') throw new Error('CSTAR mock requires NODE_ENV=development')
  const tenants = (config.CSTAR_MOCK_TENANT_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
  if (!tenants.length) throw new Error('CSTAR_MOCK_TENANT_IDS is required in mock mode')
  tenants.forEach(validateIdentifier)
  const fixture = (tenantId) => {
    validateIdentifier(tenantId)
    if (!tenants.includes(tenantId)) throw new Error('Tenant is not configured for the demo')
    const prefix = `demo-${createHash('sha256').update(tenantId).digest('hex').slice(0, 12)}`
    return [
      {
        id: `${prefix}-operations`,
        name: 'Demo Operations',
        description: 'Two fictional recipients',
        emails: ['alex@example.invalid', 'sam@example.invalid'],
      },
      {
        id: `${prefix}-communications`,
        name: 'Demo Communications',
        description: 'Overlaps Operations to demonstrate deduplication',
        emails: ['sam@example.invalid', 'jordan@example.invalid'],
      },
      { id: `${prefix}-empty`, name: 'Demo Empty Group', description: 'No members', emails: [] },
    ]
  }
  return {
    async listGroups(tenantId) {
      return {
        groups: fixture(tenantId).map(({ id, name, description }) => ({ id, name, description })),
      }
    },
    async getRecipients(tenantId, groupIds) {
      const groups = fixture(tenantId)
      groupIds.forEach(validateIdentifier)
      if (groupIds.some((id) => !groups.some((group) => group.id === id)))
        throw new Error('Group does not belong to tenant')
      return {
        emails: [
          ...new Set(
            groups.filter((group) => groupIds.includes(group.id)).flatMap((group) => group.emails),
          ),
        ],
      }
    },
  }
}
