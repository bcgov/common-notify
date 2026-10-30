import { useEffect, useRef, useState } from 'react'
import { SENDER_EMAIL_DOMAIN } from '../utils/emailSettings'

/**
 * The email tab's sender address. Loads the tenant default address if no saved value exists yet.
 */
export function useSenderEmail(savedSenderEmail: string, defaultSenderEmail?: string | null) {
  const [senderEmail, setSenderEmail] = useState(
    savedSenderEmail || (defaultSenderEmail ? `${defaultSenderEmail}@${SENDER_EMAIL_DOMAIN}` : ''),
  )
  // Once the field has been edited it is the user's, including when they empty it - the tenant
  // default must not be reapplied on top of a deliberately cleared field.
  const touched = useRef(false)

  // The tenant default loads asynchronously and can arrive after this tab has already mounted;
  // backfill it once it does, but only while the field is still untouched and unsaved.
  useEffect(() => {
    if (!touched.current && !savedSenderEmail && !senderEmail && defaultSenderEmail) {
      setSenderEmail(`${defaultSenderEmail}@${SENDER_EMAIL_DOMAIN}`)
    }
  }, [defaultSenderEmail, senderEmail, savedSenderEmail])

  // For the user's own edits, which stop the tenant default being written back.
  function editSenderEmail(value: string) {
    touched.current = true
    setSenderEmail(value)
  }

  return [senderEmail, editSenderEmail] as const
}
