import { useEffect, useState } from 'react'
import type { FC } from 'react'
import {
  Button,
  Link,
  SvgInfoIcon,
  SvgUpRightFromSquareIcon,
  Tooltip,
} from '@bcgov/design-system-react-components'
import TooltipTrigger from '@/components/TooltipTrigger'
import GenericModal from '@/components/GenericModal'
import ApiKeyRevealModal from './ApiKeyRevealModal'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import {
  fetchApiKeys,
  issueApiKey,
  regenerateApiKey,
  updateApiKeyNotes,
} from '@/redux/thunks/apiKeys.thunks'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import { useCstarRoles } from '@/hooks/useCstarRoles'
import { CstarRole } from '@/enum/cstar-role.enum'
import config from '@/config'

/** Matches the "Created on Aug 7, 2026, 12:14:39 PM" format in the design. */
function formatCreatedOn(value?: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return date.toLocaleString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

/**
 * API key block on the Tenant Settings tab.
 *
 * A tenant holds one key. It is generated here and shown exactly once; after that only
 * its label (the gateway clientId), when the current value was created, and the
 * tenant's own note are visible. Rotating is the way to replace a compromised value.
 *
 * Revoking is not here on purpose — it happens on the API Services Portal, which is the
 * only place that stops the gateway honouring the key. The tooltip links out to it.
 *
 * Owns its own fetch, like SafelistSection, so the shared settings load stays untouched.
 */
const ApiKeyField: FC = () => {
  const dispatch = useAppDispatch()
  const { keys, loading, saving, error } = useAppSelector((state) => state.apiKeys)
  const { hasRole } = useCstarRoles()
  const canManage = hasRole(CstarRole.NOTIFY_OPERATIONS_ADMIN)

  // The key Notify can act on. A tenant onboarded before self-service issuing may also
  // hold a legacy key bound through Postman — still valid, but with no gateway clientId
  // to rotate against, so it is listed and left alone rather than given dead controls.
  const apiKey = keys.find((key) => key.manageable)
  const legacyKeys = keys.filter((key) => !key.manageable)

  /**
   * The freshly issued key, held for exactly as long as the dialog showing it is open.
   *
   * Everything the dialog and the follow-up notes write need is captured here from the
   * issue response rather than read back off the store, so the flow does not depend on
   * the slice having caught up.
   */
  const [revealed, setRevealed] = useState<{
    title: string
    apiKey: string
    clientId?: string
    notes: string
  } | null>(null)
  const [isConfirmingRegenerate, setIsConfirmingRegenerate] = useState(false)

  useEffect(() => {
    dispatch(fetchApiKeys())
  }, [dispatch])

  async function handleGenerate() {
    try {
      const issued = await dispatch(issueApiKey(undefined)).unwrap()
      setRevealed({
        title: 'Generate API Key',
        apiKey: issued.apiKey,
        clientId: issued.clientId,
        notes: '',
      })
    } catch (issueError) {
      showErrorToast(typeof issueError === 'string' ? issueError : 'Failed to generate an API key')
    }
  }

  async function handleRegenerate() {
    if (!apiKey?.clientId) return

    try {
      const issued = await dispatch(regenerateApiKey(apiKey.clientId)).unwrap()
      setIsConfirmingRegenerate(false)
      setRevealed({
        title: 'New API Key',
        apiKey: issued.apiKey,
        clientId: issued.clientId ?? apiKey.clientId,
        // Rotating replaces the value, not the note. Carry it across so the dialog does
        // not look like it has thrown the note away.
        notes: apiKey.notes ?? '',
      })
    } catch (regenerateError) {
      setIsConfirmingRegenerate(false)
      showErrorToast(
        typeof regenerateError === 'string' ? regenerateError : 'Failed to regenerate the API key',
      )
    }
  }

  async function handleRevealClose(notes: string) {
    const clientId = revealed?.clientId
    const trimmed = notes.trim()
    const unchanged = trimmed === (revealed?.notes ?? '')

    if (!clientId || unchanged) {
      setRevealed(null)
      return
    }

    try {
      await dispatch(updateApiKeyNotes({ clientId, notes: trimmed || null })).unwrap()
    } catch (notesError) {
      // Stay open. This dialog is the only place a note can be written, so closing on a
      // failed save would discard what the user typed with no way to re-enter it short
      // of regenerating a working key.
      showErrorToast(
        typeof notesError === 'string'
          ? notesError
          : 'The API key was created, but the notes could not be saved. Try again.',
      )
      return
    }

    setRevealed(null)
    showSuccessToast('API key notes saved')
  }

  return (
    <div className="settings__field api-key">
      <span className="settings__label">
        API key
        <TooltipTrigger>
          <Button
            aria-label="About API keys"
            isIconButton
            size="xsmall"
            type="button"
            variant="tertiary"
          >
            <SvgInfoIcon />
          </Button>
          {/* Plain text only. A tooltip cannot hold links: it hides as soon as the
              pointer leaves the trigger, so they are unreachable by mouse and invisible
              to the keyboard. They live in the page below instead. */}
          <Tooltip className="bcds-react-aria-Tooltip settings__tooltip" placement="right">
            API keys are used to authenticate applications that connect to BC Notify APIs.
          </Tooltip>
        </TooltipTrigger>
      </span>

      {error && <div className="alert alert-danger">{error}</div>}

      {loading ? (
        <p className="settings__help">Loading API key…</p>
      ) : (
        <>
          {apiKey && (
            <p className="api-key__created">
              Created on {formatCreatedOn(apiKey.currentKeyCreatedAt)}
            </p>
          )}

          {keys.length > 0 && (
            <table className="api-key__table">
              <thead>
                <tr>
                  <th scope="col">API key label</th>
                  <th scope="col">API key notes</th>
                </tr>
              </thead>
              <tbody>
                {apiKey && (
                  <tr>
                    <td>{apiKey.clientId ?? '—'}</td>
                    <td>{apiKey.notes || '—'}</td>
                  </tr>
                )}
                {legacyKeys.map((key) => (
                  <tr key={key.id} className="api-key__row--legacy">
                    <td>Issued outside Notify</td>
                    <td>{key.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {legacyKeys.length > 0 && (
            <p className="settings__help">
              {apiKey
                ? 'The key issued outside Notify still works. Once your integration is using the new key, revoke the old one on the API Services Portal.'
                : 'This key was issued outside Notify, so it cannot be regenerated here. Generate a new key, move your integration onto it, then revoke the old one on the API Services Portal.'}
            </p>
          )}

          {/* The spacing lives on a wrapper, not on the Button: the design system spreads
              caller props over its own className, so passing one strips the variant
              styling off the button entirely. */}
          <div className="api-key__action">
            {apiKey ? (
              <Button
                type="button"
                variant="secondary"
                isDisabled={!canManage || saving}
                onClick={() => setIsConfirmingRegenerate(true)}
              >
                Regenerate API Key
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                isDisabled={!canManage || saving}
                onClick={handleGenerate}
              >
                {saving ? 'Generating…' : 'Generate API Key'}
              </Button>
            )}
          </div>
        </>
      )}

      {/* Below the button, stacked, per the design: these are references, not the
          primary action. */}
      {/* Rendered only when configured. An unset URL means the destination has not been
          confirmed, and a link to nowhere is worse than no link. */}
      {(config.API_KEY_DOCS_URL || config.API_KEY_REVOKE_URL) && (
        <p className="api-key__links">
          {config.API_KEY_DOCS_URL && (
            <Link
              className="settings__external-link"
              href={config.API_KEY_DOCS_URL}
              target="_blank"
              rel="noreferrer"
            >
              Learn more about API keys
              <SvgUpRightFromSquareIcon />
            </Link>
          )}
          {/* Revoking is done on the API gateway's own site, never in Notify. */}
          {config.API_KEY_REVOKE_URL && (
            <Link
              className="settings__external-link"
              href={config.API_KEY_REVOKE_URL}
              target="_blank"
              rel="noreferrer"
            >
              Revoke API key
              <SvgUpRightFromSquareIcon />
            </Link>
          )}
        </p>
      )}

      <GenericModal
        isOpen={isConfirmingRegenerate}
        onClose={() => setIsConfirmingRegenerate(false)}
        title="Regenerate API Key?"
        onSubmit={(event) => {
          event.preventDefault()
          return handleRegenerate()
        }}
        submitText={saving ? 'Generating' : 'Generate new key'}
        isSubmitLoading={saving}
        cancelText="Cancel"
      >
        <p>
          Generating a new API key will immediately invalidate the existing key for this tenant.
        </p>
        <p>
          Any integrations using the current key will stop working until they are updated with the
          new key.
        </p>
      </GenericModal>

      {revealed && (
        <ApiKeyRevealModal
          isOpen
          title={revealed.title}
          apiKey={revealed.apiKey}
          initialNotes={revealed.notes}
          onClose={handleRevealClose}
          isSavingNotes={saving}
        />
      )}
    </div>
  )
}

export default ApiKeyField
