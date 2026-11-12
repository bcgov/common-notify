import { useEffect, useRef, useState } from 'react'
import { Button } from '@bcgov/design-system-react-components'
import { previewGroupRecipients } from '@/api/mcpRegistry.api'
import { useAppSelector } from '@/redux/hooks'

export default function GroupRecipientsPreview({ groupIds }: { groupIds: string[] }) {
  const tenantId = useAppSelector((state) => state.tenant.selectedTenant?.id)
  const [emails, setEmails] = useState<string[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const requestId = useRef(0)
  const selection = JSON.stringify([...new Set(groupIds)].sort())
  useEffect(() => {
    requestId.current++
    setEmails(null)
    setError('')
    setBusy(false)
    return () => {
      requestId.current++
    }
  }, [selection, tenantId])

  async function preview() {
    const current = ++requestId.current
    setBusy(true)
    setEmails(null)
    setError('')
    try {
      const result = await previewGroupRecipients(JSON.parse(selection))
      if (current === requestId.current) setEmails(result.emails)
    } catch {
      if (current === requestId.current)
        setError(
          'Unable to resolve group recipients. Check that the MCP server is enabled and available.',
        )
    } finally {
      if (current === requestId.current) setBusy(false)
    }
  }
  return (
    <section aria-label="Group recipient preview">
      <Button isDisabled={!groupIds.length || busy || !tenantId} onPress={() => void preview()}>
        {busy ? 'Resolving…' : 'Preview group recipients'}
      </Button>
      <p>Read-only lookup of selected groups. No notification is sent.</p>
      {error && <p role="alert">{error}</p>}
      {emails !== null && (
        <div role="status">
          <p>
            {emails.length} unique email address{emails.length === 1 ? '' : 'es'} resolved.
          </p>
          {emails.length > 0 && (
            <ul>
              {emails.map((email) => (
                <li key={email}>{email}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
