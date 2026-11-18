const identifier = /^[A-Za-z0-9_-]{1,128}$/

export function validateIdentifier(value) {
  if (typeof value !== 'string' || !identifier.test(value)) throw new Error('Invalid identifier')
  return value
}

// Credentials belong to this adapter, never to tool arguments or the calling user.
export class CstarClient {
  constructor(config = process.env, request = fetch) {
    this.config = config
    this.request = request
    this.token = null
  }

  async accessToken() {
    if (this.token && this.token.expiresAt > Date.now() + 30000) return this.token.value
    const { CSTAR_TOKEN_URL, CSTAR_CLIENT_ID, CSTAR_CLIENT_SECRET, CSTAR_SCOPE } = this.config
    if (!CSTAR_TOKEN_URL || !CSTAR_CLIENT_ID || !CSTAR_CLIENT_SECRET) {
      throw new Error('CSTAR service account is not configured')
    }
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CSTAR_CLIENT_ID,
      client_secret: CSTAR_CLIENT_SECRET,
      ...(CSTAR_SCOPE ? { scope: CSTAR_SCOPE } : {}),
    })
    const response = await this.request(CSTAR_TOKEN_URL, {
      method: 'POST',
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) throw new Error(`CSTAR authentication failed (HTTP ${response.status})`)
    let result
    try {
      result = await response.json()
    } catch {
      throw new Error('Invalid CSTAR token response')
    }
    if (typeof result.access_token !== 'string' || !result.access_token)
      throw new Error('Invalid token response')
    this.token = {
      value: result.access_token,
      expiresAt: Date.now() + Number(result.expires_in ?? 60) * 1000,
    }
    return this.token.value
  }

  async get(path) {
    if (!this.config.CSTAR_API_URL) throw new Error('CSTAR API is not configured')
    const token = await this.accessToken()
    const response = await this.request(new URL(path, this.config.CSTAR_API_URL), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    })
    if (response.status === 401) this.token = null
    if (!response.ok) throw new Error(`CSTAR lookup failed (HTTP ${response.status})`)
    try {
      return await response.json()
    } catch {
      throw new Error('Invalid CSTAR response')
    }
  }

  async listGroups(tenantId) {
    const body = await this.get(`/api/v1/tenants/${validateIdentifier(tenantId)}/groups`)
    if (!Array.isArray(body.data?.groups)) throw new Error('Invalid CSTAR groups response')
    return {
      groups: body.data.groups.map(({ id, name, description }) => ({
        id: validateIdentifier(id),
        name,
        description: description ?? '',
      })),
    }
  }

  async getRecipients(tenantId, groupIds) {
    validateIdentifier(tenantId)
    groupIds.forEach(validateIdentifier)
    if (!groupIds.length) return { emails: [] }
    // Validate tenant ownership before expanding groups with a privileged service account.
    const { groups } = await this.listGroups(tenantId)
    const allowed = new Set(groups.map((group) => group.id))
    if (groupIds.some((id) => !allowed.has(id))) throw new Error('Group does not belong to tenant')
    const uniqueGroupIds = [...new Set(groupIds)]
    const emails = []
    // The service-account endpoint is scoped to a single tenant/group. Bound fan-out
    // to four requests at a time and fail the whole lookup if any group fails.
    for (let offset = 0; offset < uniqueGroupIds.length; offset += 4) {
      const results = await Promise.all(
        uniqueGroupIds.slice(offset, offset + 4).map(async (groupId) => {
          const body = await this.get(`/api/v1/tenants/${tenantId}/groups/${groupId}/users`)
          if (!Array.isArray(body.data?.users)) throw new Error('Invalid CSTAR users response')
          return body.data.users
            .map((user) => user?.email)
            .filter((email) => typeof email === 'string' && email.trim())
            .map((email) => email.trim().toLowerCase())
        }),
      )
      emails.push(...results.flat())
    }
    return { emails: [...new Set(emails)] }
  }
}
